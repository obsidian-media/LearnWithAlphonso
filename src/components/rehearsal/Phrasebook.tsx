import { useCallback, useEffect, useRef, useState } from "react";
import { AiLabel } from "@/components/AiLabel";
import { localeForCourse } from "@/data/course-meta";
import { type Rehearsal } from "@/lib/rehearsal-api";
import { phraseRows } from "@/lib/rehearsal-phrases";
import { EVENT_KIND_LABELS } from "@/lib/rehearsal-rules";
import { canSpeak, speak } from "@/lib/speech";
import { fetchModelSpeech } from "@/lib/use-model-speech";
import { voicePlayback } from "@/lib/voice-playback";
import {
  SAY_IT_CHECKING,
  SAY_IT_LISTENING,
  SAY_IT_FRAMING,
  sayItResultText,
} from "@/lib/say-it-copy";
import { useSayIt } from "./use-say-it";

/**
 * "Your phrases for this {event}": the key phrases of the warm-up, to hear again on the day. Tapping one speaks it with
 * /api/tts (kept for quick-start phrases) and falls back to the device voice. Alphonso is labelled an AI.
 */
export function Phrasebook({ rehearsal, onBack }: { rehearsal: Rehearsal; onBack: () => void }) {
  const { play, deviceVoice } = usePhraseAudio(rehearsal.course);
  const heading = useRef<HTMLHeadingElement>(null);
  // Opening the screen moves focus to its heading, so a keyboard or screen-reader user lands on the new content.
  useEffect(() => heading.current?.focus(), []);
  const rows = phraseRows(rehearsal.brief);
  const say = useSayIt(
    rehearsal.course,
    rows.map((r) => r.phrase),
  );
  const event = EVENT_KIND_LABELS[rehearsal.eventKind].toLowerCase();
  return (
    <section className="flex flex-col gap-4 px-5 py-6" aria-label="Your phrases">
      <button
        type="button"
        onClick={onBack}
        className="min-h-11 self-start rounded-full px-2 ds-type-footnote font-semibold text-ds-ink-soft"
      >
        Back to the plan
      </button>
      <div>
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-display ds-type-title font-semibold text-ds-ink outline-none"
        >
          Your phrases for this {event}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 ds-type-footnote text-ds-ink-soft">
          {deviceVoice ? (
            <span>Tap play to hear it.</span>
          ) : (
            <>
              <span>Tap play to hear Alphonso say it.</span>
              <AiLabel />
            </>
          )}
        </p>
        {say.canRecord && (
          <p className="mt-1 ds-type-footnote text-ds-ink-soft">{SAY_IT_FRAMING}</p>
        )}
      </div>
      <ul className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-ds-line bg-ds-card p-3"
          >
            <button
              type="button"
              aria-label={`Hear: ${row.phrase}`}
              onClick={() => void play(row.phrase)}
              disabled={say.busyRow !== null}
              className="disabled:opacity-50 grid size-11 shrink-0 place-items-center rounded-full bg-ds-brand text-ds-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className="ds-type-headline font-semibold text-ds-ink">{row.phrase}</p>
              {row.meaning && <p className="ds-type-caption text-ds-ink-soft">{row.meaning}</p>}
              {say.canRecord && (
                <>
                  <p
                    role="status"
                    aria-live="polite"
                    className="ds-type-caption font-semibold text-ds-ink-soft empty:hidden"
                  >
                    {say.busyRow === i && say.state === "recording"
                      ? SAY_IT_LISTENING
                      : say.busyRow === i && say.state === "transcribing"
                        ? SAY_IT_CHECKING
                        : say.results[i]
                          ? sayItResultText(say.results[i])
                          : ""}
                  </p>
                  {say.error && say.errorRow === i && (
                    <p role="alert" className="ds-type-caption text-ds-ink-soft">
                      {say.error}
                    </p>
                  )}
                </>
              )}
            </div>
            {say.canRecord && (
              <button
                type="button"
                aria-label={`Say: ${row.phrase}`}
                aria-pressed={say.busyRow === i && say.state === "recording"}
                disabled={say.busyRow !== null && say.busyRow !== i}
                onClick={() => say.toggle(i)}
                className="grid size-11 shrink-0 place-items-center rounded-full border border-ds-line bg-ds-sunk text-ds-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 aria-pressed:bg-ds-brand aria-pressed:text-ds-card"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Plays a phrase: the /api/tts voice, kept in memory per phrase so a replay makes no second request (every /api/tts
 * request, cached on the server or not, spends a unit of the learner's daily tts allowance), and the device voice in
 * the course language when that fails. The cache holds blobs, which the playback element reads directly (so there is no
 * object URL to revoke); it is dropped when the screen closes.
 */
function usePhraseAudio(course: Rehearsal["course"]) {
  const cache = useRef(new Map<string, Blob>());
  const run = useRef(0);
  const [deviceVoice, setDeviceVoice] = useState(false);
  useEffect(() => {
    const clips = cache.current;
    return () => {
      run.current += 1;
      voicePlayback().stop();
      clips.clear();
    };
  }, []);
  const play = useCallback(
    async (phrase: string) => {
      const playback = voicePlayback();
      const mine = ++run.current;
      playback.stop();
      // Inside the tap, so the shared element may play after the fetch below.
      playback.unlock();
      const device = () => {
        if (mine !== run.current || !canSpeak()) return;
        setDeviceVoice(true);
        speak(phrase, localeForCourse(course));
      };
      try {
        let blob = cache.current.get(phrase);
        if (!blob) {
          blob = await fetchModelSpeech(phrase, course);
          cache.current.set(phrase, blob);
        }
        if (mine !== run.current) return;
        const outcome = await playback.play(blob);
        if (outcome.result === "blocked" || outcome.result === "error") device();
      } catch {
        device();
      }
    },
    [course],
  );
  return { play, deviceVoice };
}
