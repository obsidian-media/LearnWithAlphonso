import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { LessonFrame } from "../../components/AppShell";
import { StarIcon } from "../../components/icons";
import { useServerFn } from "@tanstack/react-start";
import {
  groupByBand,
  nextAdaptiveBand,
  PLACEMENT_ORDER,
  scorePlacement,
  type PlacementQuestion,
} from "../../data/placement";
import { getCourse } from "../../data/courses";
import { isPlacementAnswerCorrect } from "../../data/placement-grading";
import { savePlacementResult } from "../../lib/sync.functions";
import { useProgress } from "../../lib/progress";
import { useTheme } from "../../lib/theme";
import { LEVELS, type Level } from "../../data/levels";

export const Route = createFileRoute("/_authenticated/placement")({
  component: PlacementPage,
  head: () => ({
    meta: [
      { title: "Placement Test — Alphonso" },
      {
        name: "description",
        content:
          "An adaptive check (up to 15 questions) that places you at the right CEFR level, from A1 to C1.",
      },
      { property: "og:title", content: "Placement Test — Alphonso" },
      { property: "og:description", content: "Find your English level in two minutes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const EMPTY_CORRECT: Record<Level, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };

type Session = {
  bandPool: Record<Level, PlacementQuestion[]>;
  /** Questions actually decided-on so far, in display order -- grows band by band as the test adapts. */
  shown: PlacementQuestion[];
  /** PLACEMENT_ORDER index of the band currently being tested. */
  bandIdx: number;
  /** Index into `shown` where the current band's questions begin. */
  bandStart: number;
};

/**
 * Always starts at A1 and walks forward to the first band that actually
 * has candidate questions -- defensive only (every shipped course has
 * content in every band), so a thin/misconfigured pool degrades to "test
 * whatever exists" instead of crashing on an undefined first question.
 */
function startSession(pool: PlacementQuestion[]): Session {
  const bandPool = groupByBand(pool);
  let idx = 0;
  while (idx < PLACEMENT_ORDER.length && (bandPool[PLACEMENT_ORDER[idx]!]?.length ?? 0) === 0) {
    idx++;
  }
  const shown = idx < PLACEMENT_ORDER.length ? bandPool[PLACEMENT_ORDER[idx]!]! : [];
  return { bandPool, shown, bandIdx: idx, bandStart: 0 };
}

function PlacementPage() {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  const navigate = useNavigate();
  const savePlacement = useServerFn(savePlacementResult);
  const setPlacementLocal = useProgress((s) => s.setPlacementLocal);
  const course = useProgress((s) => s.course);
  const [session, setSession] = useState<Session>(() =>
    startSession(getCourse(course).pickPlacement()),
  );
  const [step, setStep] = useState(0);
  // The submitted TEXT, not an option index: a listening question answers with
  // the choice's text and a translation with a whole sentence, and one grading
  // helper serves all three only if they speak the same language.
  const [picked, setPicked] = useState<string | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);
  const [skippedLevels, setSkippedLevels] = useState<Level[]>([]);
  // Imperative tally across band transitions, not itself rendered --
  // see submit()'s band-complete branch and nextAdaptiveBand in placement.ts.
  const correctByLevelRef = useRef<Record<Level, number>>({ ...EMPTY_CORRECT });

  function resetSession() {
    correctByLevelRef.current = { ...EMPTY_CORRECT };
    setSession(startSession(getCourse(course).pickPlacement()));
    setAnswers([]);
    setStep(0);
    setPicked(null);
    setDone(false);
    setSkippedLevels([]);
  }

  useEffect(() => {
    resetSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course]);

  const q = session.shown[step];
  const total = session.shown.length;

  const result = useMemo(() => {
    if (!done) return null;
    return scorePlacement(correctByLevelRef.current);
  }, [done]);

  function finish(finalAnswers: boolean[]) {
    setDone(true);
    const { level } = scorePlacement(correctByLevelRef.current);
    const score = finalAnswers.filter(Boolean).length;
    setPlacementLocal({
      cefrLevel: level,
      placementLevel: level,
      placementScore: score,
      placementTakenAt: new Date().toISOString(),
    });
    void savePlacement({ data: { level, score, course } }).catch(() => {});
  }

  function submit() {
    if (picked === null || !q) return;
    const next = [...answers, isPlacementAnswerCorrect(q, picked)];
    setPicked(null);
    setAnswers(next);

    const bandComplete = step + 1 === session.shown.length;
    if (!bandComplete) {
      setStep(step + 1);
      return;
    }

    // This band just finished -- tally it and adaptively decide what
    // comes next. See nextAdaptiveBand's doc comment (placement.ts) for
    // the skip/stop rules.
    const correctInBand = next.slice(session.bandStart).filter(Boolean).length;
    correctByLevelRef.current[q.level] = correctInBand;

    const decision = nextAdaptiveBand(session.bandPool, session.bandIdx, correctInBand);
    if (decision.skipped) {
      // Synthetic pass credit -- only ever granted when a real band lies
      // beyond it too (nextAdaptiveBand's landingHasContent guard), so
      // it's never the sole basis for the final result.
      correctByLevelRef.current[decision.skipped] = 2;
      setSkippedLevels((s) => [...s, decision.skipped!]);
    }

    const nextLevel = PLACEMENT_ORDER[decision.nextIdx];
    const nextBandQs = !decision.stop && nextLevel ? session.bandPool[nextLevel] : [];
    if (decision.stop || !nextBandQs || nextBandQs.length === 0) {
      finish(next);
      return;
    }

    setSession({
      ...session,
      shown: [...session.shown, ...nextBandQs],
      bandIdx: decision.nextIdx,
      bandStart: session.shown.length,
    });
    setStep(step + 1);
  }

  if (done && result) {
    const meta = LEVELS.find((l) => l.id === result.level)!;
    const correct = answers.filter(Boolean).length;
    return (
      <LessonFrame>
        <div className="flex flex-1 flex-col items-center justify-center px-7 text-center">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="grid size-16 place-items-center rounded-full bg-moss text-surface hard-shadow"
          >
            <StarIcon className="size-8" />
          </motion.div>
          <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
            Your level
          </p>
          <h1 className="mt-1 font-display text-[40px] font-semibold leading-none text-ink">
            {meta.id}
          </h1>
          <p className="mt-2 font-display text-lg font-semibold text-ink">{meta.name}</p>
          <p className="mt-1.5 max-w-[280px] text-sm text-ink-soft/80">{meta.blurb}</p>
          <p className="tnum mt-4 text-xs text-ink-soft/70">
            {correct} of {total} correct
          </p>
          {skippedLevels.length > 0 && (
            <p className="mt-1.5 max-w-[280px] text-[11px] text-ink-soft/60">
              Fast-tracked past {skippedLevels.join(", ")} after strong answers.
            </p>
          )}
          <button
            type="button"
            onClick={() => navigate({ to: "/learn" })}
            className="mt-8 w-full max-w-[300px] rounded-full bg-ink px-6 py-3.5 text-sm font-semibold text-surface transition hover:opacity-90"
          >
            Start learning at {meta.id}
          </button>
          <button
            type="button"
            onClick={resetSession}
            className="mt-3 text-xs font-medium text-ink-soft underline underline-offset-4"
          >
            Retake the test
          </button>
        </div>
      </LessonFrame>
    );
  }

  if (!q) {
    // Defensive only -- see startSession's comment. Every shipped course
    // has content in every band, so this path isn't expected to trigger.
    return (
      <LessonFrame>
        <div className="flex flex-1 flex-col items-center justify-center px-7 text-center">
          <p className="text-sm text-ink-soft/80">
            No placement questions are available for this course right now.
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/learn" })}
            className="mt-6 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-surface"
          >
            Back to Learn
          </button>
        </div>
      </LessonFrame>
    );
  }

  const pct = Math.round((step / total) * 100);
  // Whether finishing this question is *guaranteed* regardless of its
  // outcome -- i.e. no band beyond the current one has any content left,
  // so even the "keep going" adaptive path would immediately finish()
  // anyway. Anything else stays "Continue": the real next step (skip,
  // advance, or stop) depends on whether this last answer is correct,
  // which isn't known until it's submitted.
  const noBandsAhead = PLACEMENT_ORDER.slice(session.bandIdx + 1).every(
    (lvl) => (session.bandPool[lvl]?.length ?? 0) === 0,
  );
  const isFinalQuestion = step + 1 === total && noBandsAhead;

  return (
    <LessonFrame>
      <div className="px-6 pt-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate({ to: "/learn" })}
            aria-label="Exit placement test"
            className="text-sm font-medium text-ink-soft"
          >
            ✕
          </button>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-hairline">
            <motion.div
              className="h-full rounded-full bg-moss"
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <span className="tnum text-[11px] font-medium text-ink-soft">
            {step + 1}/{total}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-6 pb-8 pt-10">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
          Placement test
        </p>
        <AnimatePresence mode="wait">
          <motion.div
            key={q.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="text-balance font-display text-[26px] font-semibold leading-tight text-ink">
              {q.prompt}
            </h1>
            <div className={isStudioInk ? "mt-7" : "mt-7 flex flex-col gap-2.5"}>
              {(q.type === "mc" || q.type === "listening" ? q.choices : []).map((c) =>
                isStudioInk ? (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPicked(c)}
                    className={`w-full border-b border-hairline border-l-[3px] py-3 pl-3 pr-4 text-left text-[15px] font-medium text-ink transition ${
                      picked === c ? "border-l-ink" : "border-l-transparent"
                    }`}
                  >
                    {c}
                  </button>
                ) : (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPicked(c)}
                    className={`rounded-2xl border px-4 py-3.5 text-left text-[15px] font-medium transition ${
                      picked === c
                        ? "border-ink bg-ink text-surface"
                        : "border-hairline bg-surface text-ink hover:bg-parchment"
                    }`}
                  >
                    {c}
                  </button>
                ),
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="mt-auto pt-8">
          <button
            type="button"
            disabled={picked === null}
            onClick={submit}
            className="w-full rounded-full bg-moss px-6 py-3.5 text-sm font-semibold text-surface transition disabled:cursor-not-allowed disabled:bg-hairline disabled:text-ink-soft/50"
          >
            {isFinalQuestion ? "See my level" : "Continue"}
          </button>
          <p className="mt-3 text-center text-[11px] text-ink-soft/60">
            No hearts lost — this just finds your starting point.
          </p>
        </div>
      </div>
    </LessonFrame>
  );
}
