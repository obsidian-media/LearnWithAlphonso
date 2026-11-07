import { AI_NARRATED_LABEL } from "../lib/podcast-label";
import { usePodcastPlayer } from "../lib/podcast-player";
import { mascotArt } from "../lib/mascot-poses";
import { roomArt } from "./ListenLibrary";
import { Scrubber } from "./PodcastScrubber";

const SPEEDS = [0.75, 1, 1.25, 1.5];
const BACK_SECONDS = 15;
const FORWARD_SECONDS = 30;

/**
 * The full-screen player: the episode's room behind a navy sheet, Alphonso in the corner, the seek bar, back 15 /
 * play / forward 30, speed, and the transcript. Pure UI over the same store as the mini bar, so playback never
 * restarts when it opens or closes. The transcript opens in the existing transcript panel (tap a word to save it).
 */
export function FullPlayer({
  room,
  title,
  aiNarrated,
  elapsed,
  duration,
  isPlaying,
  failed,
  onToggle,
  onRetry,
  onSeek,
  onTranscript,
  onCollapse,
  onClose,
}: {
  room: string;
  title: string;
  aiNarrated: boolean;
  elapsed: number;
  duration: number;
  isPlaying: boolean;
  failed: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onSeek: (seconds: number) => void;
  onTranscript: () => void;
  onCollapse: () => void;
  onClose: () => void;
}) {
  const rate = usePodcastPlayer((s) => s.rate);
  const setRate = usePodcastPlayer((s) => s.setRate);
  const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length]!;
  const talking = mascotArt(isPlaying ? "lessonComplete" : "learnGreeting").src;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Player: ${title}`}
      className="fixed inset-0 z-40 mx-auto flex max-w-[430px] flex-col overflow-y-auto bg-ds-hero text-ds-on-hero"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center blur-md"
        style={{ backgroundImage: `url(${roomArt(room)})` }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-ds-hero/80" />
      <div className="relative flex flex-1 flex-col gap-5 px-6 pb-8 pt-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Minimise player"
            className="grid size-11 place-items-center rounded-full bg-ds-on-hero/15 text-xl font-extrabold"
          >
            ⌄
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Stop and close player"
            className="min-h-11 rounded-full bg-ds-on-hero/15 px-4 text-sm font-bold"
          >
            Close
          </button>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-72 overflow-hidden rounded-3xl border-2 border-ds-on-hero/30">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${roomArt(room)})` }}
          />
          <img
            src={talking}
            alt=""
            className={`absolute -right-2 bottom-0 w-36 ${isPlaying ? "mascot-breathe" : ""}`}
          />
        </div>

        <div className="text-center">
          <h2 className="font-display text-2xl font-extrabold leading-tight">{title}</h2>
          <p className="mt-1 text-sm font-semibold text-ds-on-hero-soft">
            Alphonso{aiNarrated ? ` · ${AI_NARRATED_LABEL}` : ""}
          </p>
        </div>

        {failed ? (
          <div className="text-center">
            <p className="mb-2 text-sm text-ds-on-hero-soft">We couldn&apos;t play this episode.</p>
            <button
              type="button"
              onClick={onRetry}
              className="min-h-11 rounded-full bg-ds-on-hero/15 px-5 text-sm font-bold"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="[&_span]:!text-ds-on-hero-soft">
              <Scrubber elapsed={elapsed} duration={duration} onSeek={onSeek} />
            </div>
            <div className="flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={() => onSeek(elapsed - BACK_SECONDS)}
                aria-label={`Back ${BACK_SECONDS} seconds`}
                className="grid size-12 place-items-center rounded-full bg-ds-on-hero/15 text-sm font-extrabold"
              >
                −{BACK_SECONDS}
              </button>
              <button
                type="button"
                onClick={onToggle}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="grid size-16 place-items-center rounded-full bg-ds-action text-2xl text-ds-on-action"
              >
                <span aria-hidden="true">{isPlaying ? "❚❚" : "▶"}</span>
              </button>
              <button
                type="button"
                onClick={() => onSeek(elapsed + FORWARD_SECONDS)}
                aria-label={`Forward ${FORWARD_SECONDS} seconds`}
                className="grid size-12 place-items-center rounded-full bg-ds-on-hero/15 text-sm font-extrabold"
              >
                +{FORWARD_SECONDS}
              </button>
            </div>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setRate(next)}
                aria-label={`Speed ${rate}x, change to ${next}x`}
                className="min-h-11 rounded-full bg-ds-on-hero/15 px-4 text-sm font-bold"
              >
                {rate}×
              </button>
              <button
                type="button"
                onClick={onTranscript}
                aria-label="Show transcript"
                className="min-h-11 rounded-full bg-ds-on-hero/15 px-4 text-sm font-bold"
              >
                Transcript
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
