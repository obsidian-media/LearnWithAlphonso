import { Fragment } from "react";
import {
  courseLanguageSpans,
  splitExplanation,
  type SpanQuestion,
} from "../lib/course-language-spans";
import { allowsSaving, savesWholeText } from "../lib/saved-word-client";
import { SaveWordHint } from "./SaveWord";
import { TappableText } from "./TappableText";

/**
 * The explanation text under a verdict. English course: every word opens the save dialog. French and
 * Spanish: only the course-language text the question itself proves (course-language-spans.ts); with
 * no `question` (generated practice) or no such text, it stays plain.
 */
export function AnswerExplanation({
  explanation,
  saveCourse,
  question,
  className = "mt-0.5 text-ds-ink-soft",
}: {
  explanation: string;
  saveCourse?: string;
  question?: SpanQuestion;
  /** The paragraph's classes; the lesson's verdict sheet sets its own token colours. */
  className?: string;
}) {
  const allowed = saveCourse !== undefined && allowsSaving(saveCourse);
  const whole = allowed && savesWholeText(saveCourse);
  const spans =
    allowed && !whole && question ? courseLanguageSpans({ ...question, explanation }) : [];
  const savable = whole || spans.length > 0;
  return (
    <>
      <p className={className}>
        {whole ? (
          <TappableText text={explanation} course={saveCourse} />
        ) : spans.length > 0 ? (
          splitExplanation(explanation, spans).map((piece, i) =>
            piece.course ? (
              <TappableText key={i} text={piece.text} course={saveCourse!} wholeCourseLanguage />
            ) : (
              <Fragment key={i}>{piece.text}</Fragment>
            ),
          )
        ) : (
          explanation
        )}
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
  question,
}: {
  correct: boolean;
  headline: string;
  explanation: string;
  /** When set and saving is allowed for it, the explanation's words open the save dialog. */
  saveCourse?: string;
  /** The question being explained; French and Spanish need it to find the course-language text. */
  question?: SpanQuestion;
}) {
  const explanationBody = (
    <AnswerExplanation explanation={explanation} saveCourse={saveCourse} question={question} />
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
        correct
          ? "border-ds-brand/40 bg-ds-brand/10 text-ds-ink"
          : "border-rose-300 bg-rose-50 text-ds-ink"
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
