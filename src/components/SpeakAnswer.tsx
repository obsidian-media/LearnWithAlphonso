import { DsIcon } from "./ds/DsIcon";
import { AI_CONSENT_COPY } from "../lib/ai-consent-copy";
import { useOptionalAiConsent } from "../lib/ai-consent-context";
import { canSpeak, speak } from "../lib/speech";
import { useSpeechCapture } from "../lib/use-speech-capture";
import type { Course } from "../data/courses";

/**
 * The answer control for a "speak" question, shared by the lesson player and
 * the review player so the two cannot drift apart.
 *
 * A spoken answer is captured, shown back to the learner as a transcript, and
 * only graded when they press Check -- deliberately not auto-graded on the
 * transcript arriving. Speech-to-text mishears things, and a learner who can
 * see "we heard X" before committing can simply say it again instead of losing
 * a heart to the microphone.
 *
 * Whenever speech cannot be captured, the control degrades to typing the
 * phrase. That covers the browser having no microphone API at all (insecure
 * context, embedded webview) AND every runtime failure: a denied permission, a
 * dead network, a failing /api/stt, silence. Feature detection alone was not
 * enough -- a learner who denied the microphone kept a mic button that could
 * never produce an answer, with Check disabled and no skip.
 *
 * That keeps the lesson answerable, which is the whole point: question counts
 * are fixed server-side, so a question the learner cannot answer is a lesson
 * they cannot complete -- no XP, no streak, no unlock, and nothing on screen
 * explaining why.
 */
export function SpeakAnswer({
  target,
  locale,
  course,
  value,
  onChange,
  checked,
}: {
  target: string;
  locale: string;
  /** Forwarded to /api/stt so Deepgram transcribes in this course's
   * language instead of defaulting to English -- see use-speech-capture.ts. */
  course: Course;
  value: string | null;
  onChange: (text: string) => void;
  checked: boolean;
}) {
  const { state, error, failed, canRecord, start, stop } = useSpeechCapture({
    onTranscript: (text) => onChange(text),
    course,
  });
  // Speech recognition sends the recording to Deepgram, so it needs the account's AI consent. Without it the
  // control is the typed fallback, and nothing is recorded or sent.
  const consent = useOptionalAiConsent();
  const needsConsent = !consent?.granted;
  // While the setting is still loading (or could not be read) there is nothing true to say about it: no "AI is off".
  const consentKnown = !consent || (consent.status !== "loading" && consent.status !== "unknown");
  const recording = state === "recording";
  const transcribing = state === "transcribing";
  // Typing appears when speech cannot be captured -- which is NOT only "this
  // browser has no microphone API". A denied permission, a dead network and a
  // failing /api/stt all leave a learner who can see a mic button that will
  // never produce an answer, and Check stays disabled because `picked` is
  // still null. There is no skip: the lesson would be unfinishable.
  const showTyping = needsConsent || !canRecord || failed;

  return (
    <div>
      <div className="mb-3 rounded-[18px] bg-ds-card px-4 py-3 shadow-[var(--ds-shadow-resting)]">
        <p className="ds-type-overline text-ds-ink-soft">Your phrase</p>
        <p className="mt-1 ds-type-title text-ds-brand">{target}</p>
        {canSpeak() && (
          <button
            type="button"
            onClick={() => speak(target, locale)}
            className="mt-2 flex w-fit items-center gap-1.5 rounded-full bg-ds-choice-tint px-3 py-1.5 ds-type-footnote font-bold text-ds-choice"
          >
            <DsIcon name="speaker" className="size-4" />
            Hear it first
          </button>
        )}
      </div>

      {!showTyping ? (
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            disabled={checked || transcribing}
            onClick={() => (recording ? stop() : void start())}
            aria-label={recording ? "Stop recording" : "Record your answer"}
            aria-pressed={recording}
            className={`grid size-16 place-items-center rounded-full transition-transform ${
              recording
                ? "scale-110 bg-ds-wrong text-ds-on-wrong shadow-[0_5px_0_var(--c-wrong-edge)]"
                : "bg-[linear-gradient(180deg,var(--c-action-hi)_0%,var(--c-action)_55%)] text-ds-on-action shadow-[0_5px_0_var(--c-action-edge)]"
            } disabled:opacity-50`}
          >
            <DsIcon name="mic" className="size-7" />
          </button>
          <p className="ds-type-caption text-ds-ink-soft" aria-live="polite">
            {recording
              ? "Listening — tap to stop"
              : transcribing
                ? "Checking what you said…"
                : value
                  ? "Tap to say it again"
                  : "Tap and say the phrase"}
          </p>
          {value && (
            <div className="w-full rounded-[18px] bg-ds-card px-4 py-3 shadow-[var(--ds-shadow-resting)]">
              <p className="ds-type-overline text-ds-ink-soft">We heard</p>
              <p className="mt-1 ds-type-headline text-ds-ink">{value}</p>
            </div>
          )}
          {error && (
            // Same rose pill the conversation route uses for a capture error.
            // Ember is the accent colour here (the lesson eyebrow, the Continue
            // button), so an error drawn in it reads as decoration.
            <p
              role="alert"
              className="self-center rounded-full bg-ds-wrong-tint px-3 py-1 ds-type-caption text-ds-wrong-ink"
            >
              {error}
            </p>
          )}
        </div>
      ) : (
        <div>
          <p className="mb-2 ds-type-caption text-ds-ink-soft">
            {needsConsent
              ? consentKnown
                ? AI_CONSENT_COPY.speakFallbackNoConsent
                : consent?.status === "unknown"
                  ? AI_CONSENT_COPY.checkFailedTitle
                  : "Type the phrase while we check your settings."
              : canRecord
                ? "Speech couldn't be checked just now — type the phrase instead."
                : "Recording isn't available on this device — type the phrase instead."}
          </p>
          {consent?.status === "unknown" && (
            <button
              type="button"
              onClick={() => void consent.refresh()}
              className="mb-2 rounded-full bg-ds-card px-3 py-1.5 ds-type-caption text-ds-brand shadow-[inset_0_0_0_1.5px_var(--c-line)]"
            >
              {AI_CONSENT_COPY.retry}
            </button>
          )}
          {needsConsent && consentKnown && consent && canRecord && (
            <button
              type="button"
              onClick={() => void consent.requestConsent()}
              className="mb-2 rounded-full bg-ds-card px-3 py-1.5 ds-type-caption text-ds-brand shadow-[inset_0_0_0_1.5px_var(--c-line)]"
            >
              {AI_CONSENT_COPY.useVoiceInstead}
            </button>
          )}
          {error && (
            <p
              role="alert"
              className="mb-2 w-fit rounded-full bg-ds-wrong-tint px-3 py-1 ds-type-caption text-ds-wrong-ink"
            >
              {error}
            </p>
          )}
          <input
            type="text"
            disabled={checked}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Type the phrase"
            aria-label="Type the phrase"
            className="w-full rounded-[var(--ds-radius-control)] border-2 border-ds-line bg-ds-card px-4 py-3.5 ds-type-headline text-ds-ink shadow-[0_4px_0_var(--c-line)] outline-none placeholder:text-ds-ink-faint focus:border-ds-choice"
          />
        </div>
      )}
    </div>
  );
}
