import { useTheme } from "../lib/theme";

/**
 * The correct/incorrect explanation shown after checking an answer.
 * Shared by the lesson player and spaced review, which rendered identical
 * markup.
 */
export function AnswerFeedback({
  correct,
  headline,
  explanation,
}: {
  correct: boolean;
  headline: string;
  explanation: string;
}) {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");

  if (isStudioInk) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`mt-5 border-l-[3px] py-2 pl-4 text-sm ${correct ? "border-l-moss" : "border-l-rose-400"}`}
      >
        <p className="font-semibold text-ink">{headline}</p>
        <p className="mt-0.5 text-ink-soft">{explanation}</p>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
        correct ? "border-moss/40 bg-moss/10 text-ink" : "border-rose-300 bg-rose-50 text-ink"
      }`}
    >
      <p className="font-semibold">{headline}</p>
      <p className="mt-0.5 text-ink-soft">{explanation}</p>
    </div>
  );
}
