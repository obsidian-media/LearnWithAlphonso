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
  const recording = state === "recording";
  const transcribing = state === "transcribing";
  // Typing appears when speech cannot be captured -- which is NOT only "this
  // browser has no microphone API". A denied permission, a dead network and a
  // failing /api/stt all leave a learner who can see a mic button that will
  // never produce an answer, and Check stays disabled because `picked` is
  // still null. There is no skip: the lesson would be unfinishable.
  const showTyping = !canRecord || failed;

  return (
    <div>
      <div className="mb-3 rounded-2xl border border-hairline bg-parchment px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft/70">
          Your phrase
        </p>
        <p className="mt-1 text-lg font-medium leading-snug text-ink">{target}</p>
        {canSpeak() && (
          <button
            type="button"
            onClick={() => speak(target, locale)}
            className="mt-2 flex w-fit items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink transition hover:border-ink/30"
          >
            🔊 Hear it first
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
                ? "scale-110 bg-ember text-ink-on-ember hard-shadow-ember"
                : "bg-moss text-surface hard-shadow"
            } disabled:opacity-50`}
          >
            <svg viewBox="0 0 24 24" className="size-7" fill="none" aria-hidden="true">
              <rect
                x="9"
                y="3"
                width="6"
                height="12"
                rx="3"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M5 11a7 7 0 0 0 14 0M12 18v3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <p className="text-xs text-ink-soft" aria-live="polite">
            {recording
              ? "Listening — tap to stop"
              : transcribing
                ? "Checking what you said…"
                : value
                  ? "Tap to say it again"
                  : "Tap and say the phrase"}
          </p>
          {value && (
            <div className="w-full rounded-2xl border border-hairline bg-surface px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft/70">
                We heard
              </p>
              <p className="mt-1 text-base text-ink">{value}</p>
            </div>
          )}
          {error && (
            // Same rose pill the conversation route uses for a capture error.
            // Ember is the accent colour here (the lesson eyebrow, the Continue
            // button), so an error drawn in it reads as decoration.
            <p
              role="alert"
              className="self-center rounded-full border border-rose-300/60 bg-rose-50 px-3 py-1 text-[11px] font-medium text-rose-700"
            >
              {error}
            </p>
          )}
        </div>
      ) : (
        <div>
          <p className="mb-2 text-xs text-ink-soft">
            {canRecord
              ? "Speech couldn't be checked just now — type the phrase instead."
              : "Recording isn't available on this device — type the phrase instead."}
          </p>
          {error && (
            <p
              role="alert"
              className="mb-2 w-fit rounded-full border border-rose-300/60 bg-rose-50 px-3 py-1 text-[11px] font-medium text-rose-700"
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
            className="w-full rounded-2xl border border-hairline bg-surface px-4 py-3.5 text-base outline-none focus:border-moss"
          />
        </div>
      )}
    </div>
  );
}
