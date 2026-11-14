import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { LessonScreen as LessonFrame } from "../../components/lesson/LessonScreen";
import { LessonAnswer, edgeButtonClass } from "../../components/lesson/LessonParts";
import { Icon } from "../../components/ds/Blocks";
import { useServerFn } from "@tanstack/react-start";
import {
  bandMarkers,
  emptyTally,
  groupByBand,
  PLACEMENT_ORDER,
  placementFinishedLabel,
  placementMaxQuestions,
  placementProgressLabel,
  placementProgressSpokenLabel,
  resolveBand,
  scorePlacement,
  type PlacementQuestion,
} from "../../data/placement";
import { COURSES, getCourse, localeForCourse, type Course } from "../../data/courses";
import { canSpeak, speak } from "../../lib/speech";
import { isPlacementAnswerCorrect } from "../../data/placement-grading";
import { fetchProgress, savePlacementResult } from "../../lib/sync.functions";
import { useProgress } from "../../lib/progress";
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

const MARKER_WORDS = {
  passed: "passed",
  skipped: "skipped after strong answers",
  current: "now",
  missed: "not passed",
  upcoming: "not reached",
} as const;

// A skipped band is dashed and a passed one solid, so credit and a real pass never look alike.
const MARKER_STYLE = {
  passed: "border-ds-choice bg-ds-choice text-ds-card",
  skipped: "border-dashed border-ds-choice text-ds-choice",
  current: "border-ds-xp bg-ds-xp-tint text-ds-xp-text",
  missed: "border-ds-line text-ds-ink-soft line-through",
  upcoming: "border-ds-line text-ds-ink-faint",
} as const;

type Session = {
  bandPool: Record<Level, PlacementQuestion[]>;
  /** Questions actually decided-on so far, in display order -- grows band by band as the test adapts. */
  shown: PlacementQuestion[];
  /** PLACEMENT_ORDER index of the band currently being tested. */
  bandIdx: number;
  /** Index into `shown` where the current band's questions begin. */
  bandStart: number;
  /** True while the current band is a skipped one the exam went back to -- the last band it asks. */
  revisiting: boolean;
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
  return { bandPool, shown, bandIdx: idx, bandStart: 0, revisiting: false };
}

function PlacementPage() {
  const navigate = useNavigate();
  const savePlacement = useServerFn(savePlacementResult);
  const setPlacementLocal = useProgress((s) => s.setPlacementLocal);
  const course = useProgress((s) => s.course);
  const setCourse = useProgress((s) => s.setCourse);
  const hydrate = useProgress((s) => s.hydrate);
  const hydrated = useProgress((s) => s.hydrated);
  const placementTakenAt = useProgress((s) => s.placementTakenAt);
  const loadProgress = useServerFn(fetchProgress);
  // A new account's course is "en" until the learner changes it on the Learn screen, so without this
  // step a French or Spanish learner sat the English test first. Shown only when this course has no
  // placement yet (a retake goes straight to the questions).
  const [languageChosen, setLanguageChosen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [session, setSession] = useState<Session>(() =>
    startSession(getCourse(course).pickPlacement(canSpeak())),
  );
  const [step, setStep] = useState(0);
  // The submitted TEXT, not an option index: a listening question answers with
  // the choice's text and a translation with a whole sentence, and one grading
  // helper serves all three only if they speak the same language.
  const [picked, setPicked] = useState<string | null>(null);
  // Only true while a translation's second opinion is in flight, so the
  // advance button can say so rather than looking frozen.
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);
  const [skippedLevels, setSkippedLevels] = useState<Level[]>([]);
  // Imperative tally across band transitions, not itself rendered --
  // see submit()'s band-complete branch and resolveBand in placement.ts.
  const correctByLevelRef = useRef<Record<Level, number>>(emptyTally().correctByLevel);

  function resetSession() {
    correctByLevelRef.current = emptyTally().correctByLevel;
    setSession(startSession(getCourse(course).pickPlacement(canSpeak())));
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
  // The longest this sitting can get, fixed by the pool and shown from the first question: the counter must not
  // grow as the exam adapts.
  const maxQuestions = placementMaxQuestions(session.bandPool);

  async function chooseLanguage(next: Course) {
    if (switching) return;
    setSwitching(true);
    try {
      if (next !== course) {
        setCourse(next);
        // Same as the Learn screen's course switch; if it fails (offline) the test still starts in the
        // chosen course and the progress loads on the next visit to Learn.
        try {
          hydrate(await loadProgress({ data: { course: next } }));
        } catch {
          // keep going
        }
      }
      setLanguageChosen(true);
    } finally {
      setSwitching(false);
    }
  }

  const needsLanguage = hydrated && !placementTakenAt && !languageChosen && !done;

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
    // Placement is graded on the device against the curated wordings and never sends an answer to an AI grader, so
    // it works for a learner who has not allowed AI and never waits on a network.
    const correct = isPlacementAnswerCorrect(q, picked);
    const next = [...answers, correct];
    setPicked(null);
    setAnswers(next);

    const bandComplete = step + 1 === session.shown.length;
    if (!bandComplete) {
      setStep(step + 1);
      return;
    }

    // This band just finished -- tally it and adaptively decide what
    // comes next. resolveBand (placement.ts) owns the skip/stop rules AND
    // what a skip's synthetic credit is worth: it only stands once the
    // band after the skip is really passed. If that band was failed, the
    // credit comes back out and nextIdx points BACKWARDS, so the exam
    // asks the skipped band instead -- a placement never rests on a band
    // the learner was never asked.
    const correctInBand = next.slice(session.bandStart).filter(Boolean).length;
    const resolution = resolveBand(session.bandPool, session.bandIdx, correctInBand, {
      correctByLevel: correctByLevelRef.current,
      skippedLevels,
      revisiting: session.revisiting,
    });
    correctByLevelRef.current = resolution.tally.correctByLevel;
    setSkippedLevels(resolution.tally.skippedLevels);

    const nextLevel = PLACEMENT_ORDER[resolution.nextIdx];
    const nextBandQs = !resolution.stop && nextLevel ? session.bandPool[nextLevel] : [];
    if (resolution.stop || !nextBandQs || nextBandQs.length === 0) {
      finish(next);
      return;
    }

    setSession({
      ...session,
      shown: [...session.shown, ...nextBandQs],
      bandIdx: resolution.nextIdx,
      bandStart: session.shown.length,
      revisiting: resolution.tally.revisiting,
    });
    setStep(step + 1);
  }

  if (needsLanguage) {
    return (
      <LessonFrame>
        <div className="flex flex-1 flex-col items-center justify-center px-7 text-center">
          <h1 className="ds-type-display font-semibold leading-tight text-ds-ink">
            Which language do you want to learn?
          </h1>
          <p className="mt-2 max-w-[280px] ds-type-footnote text-ds-ink-soft">
            The level test is in the language you pick. You can add the others later from the Learn
            screen.
          </p>
          <div className="mt-8 flex w-full max-w-[300px] flex-col gap-3">
            {COURSES.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={switching}
                aria-pressed={c.id === course}
                onClick={() => void chooseLanguage(c.id)}
                className="rounded-[var(--ds-radius-control)] border-2 border-ds-line bg-ds-card px-4 py-3.5 text-left ds-type-answer text-ds-brand shadow-[0_4px_0_var(--c-line)] disabled:opacity-60"
              >
                {c.flag} {c.label}
              </button>
            ))}
          </div>
        </div>
      </LessonFrame>
    );
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
            className="grid size-20 place-items-center"
          >
            <Icon name="trophy" size={72} />
          </motion.div>
          <p className="mt-6 ds-type-caption font-semibold uppercase tracking-[0.18em] text-ds-xp-text">
            Your level
          </p>
          <h1 className="mt-1 ds-type-display-x-l font-semibold leading-none text-ds-ink">
            {meta.id}
          </h1>
          <p className="mt-2 ds-type-headline font-semibold text-ds-ink">{meta.name}</p>
          <p className="mt-1.5 max-w-[280px] ds-type-footnote text-ds-ink-soft">{meta.blurb}</p>
          <p className="tnum mt-4 ds-type-caption text-ds-ink-soft">
            {correct} of {total} correct
          </p>
          {total < maxQuestions && (
            <p className="mt-1 ds-type-caption font-medium text-ds-choice">
              {placementFinishedLabel(total)}
            </p>
          )}
          {skippedLevels.length > 0 && (
            <p className="mt-1.5 max-w-[280px] ds-type-caption text-ds-ink-soft">
              Fast-tracked past {skippedLevels.join(", ")} after strong answers.
            </p>
          )}
          <button
            type="button"
            onClick={() => navigate({ to: "/learn" })}
            className={`mt-8 max-w-[300px] ${edgeButtonClass("primary")}`}
          >
            Start learning at {meta.id}
          </button>
          <button
            type="button"
            onClick={resetSession}
            className="mt-3 min-h-11 ds-type-footnote font-extrabold text-ds-choice underline underline-offset-4"
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
          <p className="ds-type-footnote text-ds-ink-soft">
            No placement questions are available for this course right now.
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/learn" })}
            className={`mt-6 ${edgeButtonClass("primary")}`}
          >
            Back to Learn
          </button>
        </div>
      </LessonFrame>
    );
  }

  const pct = Math.round((step / maxQuestions) * 100);
  const markers = bandMarkers(
    session.bandPool,
    session.shown,
    session.bandIdx,
    { correctByLevel: correctByLevelRef.current, skippedLevels, revisiting: session.revisiting },
    false,
  );
  // Whether finishing this question is *guaranteed* regardless of its
  // outcome -- i.e. no band beyond the current one has any content left,
  // so even the "keep going" adaptive path would immediately finish()
  // anyway, or this is a skipped band the exam went back to, which is
  // always the last one it asks. Anything else stays "Continue": the real
  // next step (skip, advance, go back or stop) depends on whether this
  // last answer is correct, which isn't known until it's submitted.
  const noBandsAhead = PLACEMENT_ORDER.slice(session.bandIdx + 1).every(
    (lvl) => (session.bandPool[lvl]?.length ?? 0) === 0,
  );
  const isFinalQuestion = step + 1 === total && (noBandsAhead || session.revisiting);

  return (
    <LessonFrame>
      <div className="px-6 pt-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate({ to: "/learn" })}
            aria-label="Exit placement test"
            className="ds-type-footnote font-medium text-ds-ink-soft"
          >
            ✕
          </button>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-ds-line">
            <motion.div
              className="h-full rounded-full bg-ds-choice"
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <span className="tnum ds-type-caption font-medium text-ds-ink-soft">
            <span aria-hidden="true">{placementProgressLabel(step + 1, maxQuestions)}</span>
            <span className="sr-only">{placementProgressSpokenLabel(step + 1, maxQuestions)}</span>
          </span>
        </div>
        <ul aria-label="Levels" className="mt-3 flex justify-center gap-1.5">
          {markers.map((m) => (
            <li
              key={m.level}
              data-state={m.state}
              aria-label={`${m.level}, ${MARKER_WORDS[m.state]}`}
              className={`tnum rounded-full border px-2.5 py-0.5 ds-type-caption font-semibold ${MARKER_STYLE[m.state]}`}
            >
              {m.level}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-1 flex-col px-6 pb-8 pt-10">
        <p className="mb-2 ds-type-caption font-semibold uppercase tracking-[0.18em] text-ds-xp-text">
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
            {q.type === "listening" && (
              <div className="mb-4">
                <p className="mb-2 ds-type-caption font-semibold uppercase tracking-[0.16em] text-ds-ink-soft">
                  Listening
                </p>
                {/* No no-audio branch here on purpose. canSpeak() is a
                    capability check -- `"speechSynthesis" in window` -- so it
                    cannot flip between one question and the next; a browser
                    does not lose the API mid-attempt. A listening question can
                    therefore only reach this screen on a device that answered
                    true when the session was built, and an unreachable fallback
                    is worse than none: it would have to grade a blind guess,
                    and nothing could ever exercise it. Devices that cannot
                    speak never see these questions at all -- playablePool
                    removes them before the draw. */}
                <button
                  type="button"
                  onClick={() => speak(q.audioText, localeForCourse(course))}
                  className="flex min-h-11 w-fit items-center gap-2 rounded-full bg-ds-card px-4 py-2 ds-type-footnote font-extrabold text-ds-brand shadow-[var(--ds-shadow-resting)]"
                >
                  🔊 Play audio
                </button>
              </div>
            )}
            <h1 className="text-balance ds-type-question font-semibold leading-tight text-ds-ink">
              {q.prompt}
            </h1>
            <div className={"mt-7 flex flex-col gap-2.5"}>
              {q.type === "translate" && (
                <textarea
                  value={picked ?? ""}
                  onChange={(e) => setPicked(e.target.value)}
                  rows={3}
                  placeholder="Write your answer"
                  aria-label="Your answer"
                  className="w-full resize-none rounded-[var(--ds-radius-control)] border-2 border-ds-line bg-ds-card px-4 py-3.5 ds-type-answer text-ds-ink shadow-[0_4px_0_var(--c-line)] outline-none focus:border-ds-choice"
                />
              )}
              {(q.type === "mc" || q.type === "listening" ? q.choices : []).map((c, i) => (
                <LessonAnswer
                  key={c}
                  index={i}
                  label={c}
                  checked={false}
                  isPicked={picked === c}
                  isRight={false}
                  disabled={false}
                  onClick={() => setPicked(c)}
                />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="mt-auto pt-8">
          <button
            type="button"
            disabled={!picked?.trim()}
            onClick={submit}
            className={edgeButtonClass("primary")}
          >
            {isFinalQuestion ? "See my level" : "Continue"}
          </button>
          <p className="mt-3 text-center ds-type-caption text-ds-ink-soft">
            No hearts lost — this just finds your starting point.
          </p>
        </div>
      </div>
    </LessonFrame>
  );
}
