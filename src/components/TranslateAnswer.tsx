import type { Question } from "../data/curriculum";
import { AI_CONSENT_COPY } from "../lib/ai-consent-copy";
import { useOptionalAiConsent } from "../lib/ai-consent-context";
import type { TranslationVerdict } from "../routes/api/grade-translation";

/**
 * The answer control for a "translate" question, shared by the lesson player
 * and the review player so the two cannot drift apart.
 *
 * The prompt describes the idea rather than the sentence, and the accepted
 * phrasings stay hidden until the learner has answered -- showing them up front
 * turns producing English into copying it. After a wrong answer exactly one
 * phrasing is revealed, framed as "one way to say it" rather than as the
 * answer, because several wordings are right and the learner's own may have
 * been one the list simply did not anticipate.
 */
export function TranslateAnswer({
  question,
  value,
  onChange,
  checked,
  verdict,
  showAiGradingOption,
}: {
  question: Extract<Question, { type: "translate" }>;
  value: string | null;
  onChange: (text: string) => void;
  checked: boolean;
  /** The settled verdict once checked: local, or the server's second opinion.
   *  `null` before checking, and while that opinion is still in flight. */
  verdict: TranslationVerdict | null;
  /** Offer to turn AI grading on when the learner has not allowed it (lessons and review, not placement). */
  showAiGradingOption?: boolean;
}) {
  const consent = useOptionalAiConsent();
  return (
    <div>
      {/* The prompt itself is rendered by the player, as the question heading,
          exactly like every other type -- repeating it here showed it twice. */}
      <textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={checked}
        rows={3}
        placeholder="Write your answer"
        aria-label="Your answer"
        className="w-full resize-none rounded-2xl border border-hairline bg-surface px-4 py-3.5 text-base outline-none focus:border-moss disabled:opacity-70"
      />

      {showAiGradingOption &&
        consent &&
        consent.status !== "loading" &&
        !consent.granted &&
        !checked && (
          <p className="mt-2 text-xs text-ink-soft">
            {AI_CONSENT_COPY.localGradingNote}{" "}
            <button
              type="button"
              onClick={() => void consent.requestConsent()}
              className="font-semibold text-moss underline"
            >
              {AI_CONSENT_COPY.turnOnAiGrading}
            </button>
          </p>
        )}

      {checked && verdict && !verdict.correct && (
        <div className="mt-3 rounded-2xl border border-hairline bg-surface px-4 py-3">
          {verdict.reason && <p className="text-sm text-ink">{verdict.reason}</p>}
          <p className={verdict.reason ? "mt-2" : ""}>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft/70">
              One way to say it
            </span>
            <br />
            <span className="text-base text-ink">{question.acceptableAnswers[0]}</span>
          </p>
        </div>
      )}
    </div>
  );
}
