import { canSpeak, speak } from "../lib/speech";
import { useSpeechCapture } from "../lib/use-speech-capture";

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
 * Where the browser cannot record at all (insecure context, embedded webview,
 * no microphone), the control degrades to typing the phrase. That keeps the
 * lesson answerable: question counts are fixed server-side, so a question the
 * learner cannot answer is a lesson they cannot complete -- no XP, no streak,
 * no unlock, and nothing on screen explaining why.
 */
export function SpeakAnswer({
  target,
  locale,
  value,
  onChange,
  checked,
}: {
  target: string;
  locale: string;
  value: string | null;
  onChange: (text: string) => void;
  checked: boolean;
}) {
  const { state, error, canRecord, start, stop } = useSpeechCapture({
    onTranscript: (text) => onChange(text),
  });
  const recording = state === "recording";
  const transcribing = state === "transcribing";

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

      {canRecord ? (
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
            <p role="alert" className="text-center text-xs text-ember">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div>
          <p className="mb-2 text-xs text-ink-soft">
            Recording isn&apos;t available on this device — type the phrase instead.
          </p>
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
