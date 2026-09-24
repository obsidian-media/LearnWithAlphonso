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
        className={`mt-5 flex items-start gap-3 border-l-[3px] py-2 pl-4 text-sm ${correct ? "border-l-moss" : "border-l-rose-400"}`}
      >
        {!correct && (
          <img
            src="/mascots/alphonso.png"
            alt="Alphonso"
            className="size-10 shrink-0 rounded-lg object-cover"
          />
        )}
        <div>
          <p className="font-semibold text-ink">{headline}</p>
          <p className="mt-0.5 text-ink-soft">{explanation}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
        correct ? "border-moss/40 bg-moss/10 text-ink" : "border-rose-300 bg-rose-50 text-ink"
      }`}
    >
      {!correct && (
        <img
          src="/mascots/alphonso.png"
          alt="Alphonso"
          className="size-10 shrink-0 rounded-lg object-cover"
        />
      )}
      <div>
        <p className="font-semibold">{headline}</p>
        <p className="mt-0.5 text-ink-soft">{explanation}</p>
      </div>
    </div>
  );
}
