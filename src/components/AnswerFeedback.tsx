import { allowsSaving } from "../lib/saved-word-client";
import { useTheme } from "../lib/theme";
import { SaveWordHint } from "./SaveWord";
import { TappableText } from "./TappableText";

/** The explanation text under a verdict; its words open the save dialog when saving is allowed for the course. */
export function AnswerExplanation({
  explanation,
  saveCourse,
}: {
  explanation: string;
  saveCourse?: string;
}) {
  const savable = saveCourse !== undefined && allowsSaving(saveCourse);
  return (
    <>
      <p className="mt-0.5 text-ink-soft">
        {savable ? <TappableText text={explanation} course={saveCourse} /> : explanation}
      </p>
      {savable && <SaveWordHint />}
    </>
  );
}

/**
 * The correct/incorrect explanation shown after checking an answer.
 * Shared by the lesson player and spaced review, which rendered identical
 * markup.
 */
export function AnswerFeedback({
  correct,
  headline,
  explanation,
  saveCourse,
}: {
  correct: boolean;
  headline: string;
  explanation: string;
  /** When set and saving is allowed for it, the explanation's words open the save dialog. */
  saveCourse?: string;
}) {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  const explanationBody = <AnswerExplanation explanation={explanation} saveCourse={saveCourse} />;

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
            width={40}
            height={40}
            decoding="async"
            className="size-10 shrink-0 rounded-lg object-cover"
          />
        )}
        <div>
          <p className="font-semibold text-ink">{headline}</p>
          {explanationBody}
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
          width={40}
          height={40}
          decoding="async"
          className="size-10 shrink-0 rounded-lg object-cover"
        />
      )}
      <div>
        <p className="font-semibold">{headline}</p>
        {explanationBody}
      </div>
    </div>
  );
}
