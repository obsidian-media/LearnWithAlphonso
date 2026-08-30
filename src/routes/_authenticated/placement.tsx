import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useMemo, useState } from "react";
import { LessonFrame } from "../../components/AppShell";
import { StarIcon } from "../../components/icons";
import { useServerFn } from "@tanstack/react-start";
import { PLACEMENT_QUESTIONS, scorePlacement } from "../../data/placement";
import { savePlacementResult } from "../../lib/sync.functions";
import { useProgress } from "../../lib/progress";
import { LEVELS, type Level } from "../../data/levels";

export const Route = createFileRoute("/_authenticated/placement")({
  component: PlacementPage,
  head: () => ({
    meta: [
      { title: "Placement Test — Lingua" },
      {
        name: "description",
        content: "A 15-question check that places you at the right CEFR level, from A1 to C1.",
      },
      { property: "og:title", content: "Placement Test — Lingua" },
      { property: "og:description", content: "Find your English level in two minutes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function PlacementPage() {
  const navigate = useNavigate();
  const savePlacement = useServerFn(savePlacementResult);
  const setPlacementLocal = useProgress((s) => s.setPlacementLocal);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);

  const q = PLACEMENT_QUESTIONS[step];
  const total = PLACEMENT_QUESTIONS.length;

  const result = useMemo(() => {
    if (!done) return null;
    const byLevel = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 } as Record<Level, number>;
    PLACEMENT_QUESTIONS.forEach((item, i) => {
      if (answers[i]) byLevel[item.level] += 1;
    });
    return scorePlacement(byLevel);
  }, [done, answers]);

  function submit() {
    if (picked === null) return;
    const next = [...answers, picked === q.answer];
    setPicked(null);
    if (step + 1 >= total) {
      setAnswers(next);
      setDone(true);
      const byLevel = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 } as Record<Level, number>;
      PLACEMENT_QUESTIONS.forEach((item, i) => {
        if (next[i]) byLevel[item.level] += 1;
      });
      const { level } = scorePlacement(byLevel);
      const score = next.filter(Boolean).length;
      setPlacementLocal({
        cefrLevel: level,
        placementLevel: level,
        placementScore: score,
        placementTakenAt: new Date().toISOString(),
      });
      void savePlacement({ data: { level, score } }).catch(() => {});
    } else {
      setAnswers(next);
      setStep(step + 1);
    }
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
          <button
            type="button"
            onClick={() => navigate({ to: "/learn" })}
            className="mt-8 w-full max-w-[300px] rounded-full bg-ink px-6 py-3.5 text-sm font-semibold text-surface transition hover:opacity-90"
          >
            Start learning at {meta.id}
          </button>
          <button
            type="button"
            onClick={() => {
              setAnswers([]);
              setStep(0);
              setPicked(null);
              setDone(false);
            }}
            className="mt-3 text-xs font-medium text-ink-soft underline underline-offset-4"
          >
            Retake the test
          </button>
        </div>
      </LessonFrame>
    );
  }

  const pct = Math.round((step / total) * 100);

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
            <div className="mt-7 flex flex-col gap-2.5">
              {q.choices.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setPicked(i)}
                  className={`rounded-2xl border px-4 py-3.5 text-left text-[15px] font-medium transition ${
                    picked === i
                      ? "border-ink bg-ink text-surface"
                      : "border-hairline bg-surface text-ink hover:bg-parchment"
                  }`}
                >
                  {c}
                </button>
              ))}
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
            {step + 1 === total ? "See my level" : "Continue"}
          </button>
          <p className="mt-3 text-center text-[11px] text-ink-soft/60">
            No hearts lost — this just finds your starting point.
          </p>
        </div>
      </div>
    </LessonFrame>
  );
}
