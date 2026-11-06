import { Fragment } from "react";
import {
  courseLanguageSpans,
  splitExplanation,
  type SpanQuestion,
} from "../lib/course-language-spans";
import { allowsSaving, savesWholeText } from "../lib/saved-word-client";
import { useTheme } from "../lib/theme";
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
  className = "mt-0.5 text-ink-soft",
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
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  const explanationBody = (
    <AnswerExplanation explanation={explanation} saveCourse={saveCourse} question={question} />
  );

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
