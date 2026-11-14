import { motion } from "framer-motion";
import { verdictTitle } from "../lib/answer-verdict";
import { usePrefersReducedMotion } from "../lib/use-prefers-reduced-motion";
import type { SpanQuestion } from "../lib/course-language-spans";
import { AnswerExplanation } from "./AnswerFeedback";

/**
 * Everything after Check, in one panel at the bottom of the question: green or red, the verdict, the right answer
 * when it was missed, the explanation, Alphonso reacting (happy or a thumbs-up), and the button on. Shared by the
 * lesson player and review. The verdict is the caller's: a translation's comes from its settled grade.
 *
 * Studio Ink keeps its own quieter look: the left-bar feedback and the plain ember button.
 */
export function AnswerVerdictPanel({
  correct,
  correctAnswer,
  explanation,
  saveCourse,
  question,
  continueLabel,
  onContinue,
  title: titleOverride,
}: {
  /** A screen's own wording for the verdict (review says "Still got it."); defaults to Correct! / Not quite. */
  title?: string;
  correct: boolean;
  correctAnswer: string;
  explanation: string;
  saveCourse?: string;
  /** The question, so French and Spanish can find the course-language text to offer for saving. */
  question?: SpanQuestion;
  continueLabel: string;
  onContinue: () => void;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const title = titleOverride ?? verdictTitle(correct);

  return (
    <div className="mt-auto pt-6">
      <motion.div
        role="status"
        aria-live="polite"
        data-verdict={correct ? "correct" : "wrong"}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          reduceMotion ? { duration: 0.2 } : { type: "spring", stiffness: 380, damping: 30 }
        }
        className={`rounded-[28px] border-t-4 px-4 pb-4 pt-3 text-sm ${
          correct ? "border-moss bg-moss/15" : "border-rose-400 bg-rose-500/10"
        }`}
      >
        <div className="flex items-start gap-3">
          <img
            src={correct ? "/mascots/alphonso-happy.png" : "/mascots/alphonso-encouraging.png"}
            alt=""
            width={64}
            height={64}
            decoding="async"
            className="size-16 shrink-0 object-contain"
          />
          <div className="min-w-0 flex-1 pt-1 text-left">
            <p
              className={`font-display text-xl font-bold ${correct ? "text-moss" : "text-rose-500"}`}
            >
              {title}
            </p>
            {!correct && correctAnswer && (
              <p className="mt-0.5 text-[15px] font-semibold text-ink">Answer: {correctAnswer}</p>
            )}
            <AnswerExplanation
              explanation={explanation}
              saveCourse={saveCourse}
              question={question}
            />
          </div>
        </div>
        <button
          onClick={onContinue}
          className={`mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-2xl px-6 py-3 font-display text-base font-bold tracking-wide transition-[transform,box-shadow] duration-100 active:translate-y-1 active:shadow-none motion-reduce:transition-none ${
            correct
              ? "bg-moss text-surface shadow-[0_4px_0_0_var(--color-edge-moss)]"
              : "bg-rose-500 text-white shadow-[0_4px_0_0_rgba(136,19,55,0.9)]"
          }`}
        >
          {continueLabel}
        </button>
      </motion.div>
    </div>
  );
}
