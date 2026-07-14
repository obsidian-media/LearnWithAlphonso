import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { LessonFrame } from "../components/AppShell";
import { CheckIcon } from "../components/icons";
import { findLesson, type Question } from "../data/curriculum";
import { useProgress } from "../lib/progress";

export const Route = createFileRoute("/lesson/$id")({
  head: ({ params }) => ({
    meta: [{ title: `Lesson · Lingua` }, { name: "robots", content: "noindex" }],
  }),
  component: LessonPage,
});

type Result = { correct: boolean; explanation: string; correctAnswer: string };

function LessonPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const found = useMemo(() => findLesson(id), [id]);
  const completeLesson = useProgress((s) => s.completeLesson);
  const loseHeart = useProgress((s) => s.loseHeart);

  const [step, setStep] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [answer, setAnswer] = useState<string | number | null>(null);
  const [summary, setSummary] = useState<{ xp: number } | null>(null);

  if (!found) {
    return (
      <LessonFrame>
        <div className="p-8 text-center">
          <p className="font-display text-xl">Lesson not found.</p>
          <button
            onClick={() => navigate({ to: "/" })}
            className="mt-4 text-sm underline"
          >
            Back to Learn
          </button>
        </div>
      </LessonFrame>
    );
  }

  const { lesson } = found;
  const total = lesson.questions.length;
  const q = lesson.questions[step];
  const progress = ((step + (result ? 1 : 0)) / total) * 100;

  function check() {
    if (answer === null) return;
    let ok = false;
    let correctAnswer = "";
    if (q.type === "mc") {
      ok = answer === q.answer;
      correctAnswer = q.choices[q.answer];
    } else {
      ok = String(answer).trim().toLowerCase() === q.answer.toLowerCase();
      correctAnswer = q.answer;
    }
    if (ok) setCorrectCount((c) => c + 1);
    else loseHeart();
    setResult({ correct: ok, explanation: q.explanation, correctAnswer });
  }

  function next() {
    setResult(null);
    setAnswer(null);
    if (step + 1 >= total) {
      const xp = completeLesson(lesson.id, correctCount, total);
      setSummary({ xp });
    } else {
      setStep(step + 1);
    }
  }

  if (summary) {
    return (
      <LessonFrame>
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="mb-6 grid size-24 place-items-center rounded-full bg-moss text-surface hard-shadow"
          >
            <CheckIcon className="size-12" />
          </motion.div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
            Lesson Complete
          </p>
          <h1 className="mb-6 font-display text-3xl font-semibold leading-tight">
            {lesson.title}
          </h1>
          <div className="mb-10 grid w-full max-w-xs grid-cols-2 gap-3">
            <div className="rounded-xl border border-hairline bg-parchment p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                XP earned
              </p>
              <p className="tnum mt-1 font-display text-2xl font-semibold text-moss">
                +{summary.xp}
              </p>
            </div>
            <div className="rounded-xl border border-hairline bg-parchment p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
                Accuracy
              </p>
              <p className="tnum mt-1 font-display text-2xl font-semibold text-ink">
                {Math.round((correctCount / total) * 100)}%
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate({ to: "/" })}
            className="hard-shadow w-full max-w-xs rounded-2xl bg-moss px-6 py-4 font-display text-base font-semibold text-surface"
          >
            Continue
          </button>
        </div>
      </LessonFrame>
    );
  }

  return (
    <LessonFrame>
      {/* Top: progress + close */}
      <div className="flex items-center gap-4 px-5 pt-5">
        <button
          onClick={() => navigate({ to: "/" })}
          aria-label="Close lesson"
          className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-parchment"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none">
            <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-parchment">
          <motion.div
            className="absolute inset-y-0 left-0 bg-moss"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <span className="tnum text-xs font-semibold text-ink-soft">
          {step + 1}/{total}
        </span>
      </div>

      {/* Question */}
      <div className="flex flex-1 flex-col px-6 pt-8">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ember">
          {q.type === "mc" ? "Multiple choice" : "Fill the blank"}
        </p>
        <h1 className="font-display text-2xl font-semibold leading-tight text-balance text-ink">
          {q.prompt.split("___")[0]}
          {q.type === "fill" && (
            <span className="mx-1 inline-block min-w-[3ch] rounded-md border-b-2 border-dashed border-moss/50 px-2 text-center text-moss">
              {typeof answer === "string" ? answer : "\u00A0"}
            </span>
          )}
          {q.prompt.split("___")[1] ?? ""}
        </h1>

        <div className="mt-8 grid gap-3">
          <QuestionInput q={q} answer={answer} setAnswer={setAnswer} disabled={!!result} />
        </div>
      </div>

      {/* Check button */}
      <div className="sticky bottom-0 bg-surface/95 px-6 pb-6 pt-4 backdrop-blur-md">
        <button
          onClick={check}
          disabled={answer === null || answer === ""}
          className="hard-shadow w-full rounded-2xl bg-moss px-6 py-4 font-display text-base font-semibold text-surface disabled:cursor-not-allowed disabled:bg-parchment disabled:text-ink-soft/50 disabled:shadow-none"
        >
          Check Answer
        </button>
      </div>

      {/* Result sheet */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
            className={`fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] rounded-t-3xl border-t px-6 pb-8 pt-5 ${
              result.correct
                ? "border-moss/30 bg-moss/10"
                : "border-ember/30 bg-ember/10"
            }`}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/20" />
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${
                  result.correct ? "bg-moss text-surface" : "bg-ember text-surface"
                }`}
              >
                {result.correct ? (
                  <CheckIcon className="size-5" />
                ) : (
                  <svg viewBox="0 0 24 24" className="size-5" fill="none">
                    <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <p className="font-display text-lg font-semibold">
                  {result.correct ? "Nicely done." : "Not quite."}
                </p>
                {!result.correct && (
                  <p className="mt-0.5 text-sm text-ink-soft">
                    Answer: <span className="font-semibold text-ink">{result.correctAnswer}</span>
                  </p>
                )}
                <p className="mt-1 text-sm text-ink-soft/90">{result.explanation}</p>
              </div>
            </div>
            <button
              onClick={next}
              className={`mt-5 w-full rounded-2xl px-6 py-3.5 font-display text-base font-semibold text-surface ${
                result.correct ? "bg-moss hard-shadow" : "bg-ember hard-shadow-ember"
              }`}
            >
              Continue
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </LessonFrame>
  );
}

function QuestionInput({
  q,
  answer,
  setAnswer,
  disabled,
}: {
  q: Question;
  answer: string | number | null;
  setAnswer: (v: string | number) => void;
  disabled: boolean;
}) {
  if (q.type === "mc") {
    return (
      <>
        {q.choices.map((choice, i) => {
          const selected = answer === i;
          return (
            <button
              key={i}
              disabled={disabled}
              onClick={() => setAnswer(i)}
              className={`flex items-center gap-4 rounded-2xl border-2 px-4 py-3.5 text-left transition-colors ${
                selected
                  ? "border-moss bg-moss/5"
                  : "border-hairline bg-surface hover:border-moss/30"
              }`}
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-md border text-[11px] font-semibold tnum ${
                  selected
                    ? "border-moss bg-moss text-surface"
                    : "border-hairline text-ink-soft"
                }`}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span className="text-[15px] font-medium text-ink">{choice}</span>
            </button>
          );
        })}
      </>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {q.bank.map((word, i) => {
        const selected = answer === word;
        return (
          <button
            key={i}
            disabled={disabled}
            onClick={() => setAnswer(word)}
            className={`rounded-xl border-2 px-4 py-2.5 font-medium transition-colors ${
              selected
                ? "border-moss bg-moss text-surface"
                : "border-hairline bg-surface text-ink hover:border-moss/40"
            }`}
          >
            {word}
          </button>
        );
      })}
    </div>
  );
}