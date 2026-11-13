import { useEffect, useRef, useState } from "react";
import { AI_NARRATED_LABEL } from "../lib/podcast-label";
import { usePodcastPlayer } from "../lib/podcast-player";
import { mascotArt } from "../lib/mascot-poses";
import { roomArt } from "./ListenLibrary";
import { DsIcon } from "./ds/DsIcon";
import { Scrubber } from "./PodcastScrubber";
import { TimedTranscript } from "./TimedTranscript";
import { shouldDismissSwipe } from "../lib/swipe-dismiss";
import { SLEEP_CHOICES, SLEEP_OFF, sleepRemainingMs, startSleep } from "../lib/sleep-timer";
import { useTimedLines } from "../lib/use-timed-lines";

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
  episodeId,
  transcript,
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
  episodeId: string | null;
  transcript: string | null;
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
  const lines = useTimedLines(episodeId, transcript);
  const sleep = usePodcastPlayer((s) => s.sleep);
  const setSleep = usePodcastPlayer((s) => s.setSleep);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sleep.endsAtMs === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [sleep]);
  const remaining = sleepRemainingMs(sleep, now);
  const sleepLabel =
    sleep.choice === "end"
      ? "Sleep: end of episode"
      : remaining !== null
        ? `Sleep: ${Math.max(1, Math.ceil(remaining / 60_000))} min left`
        : "Sleep";

  // Swipe down on the top of the sheet (grab area), or press Escape, to minimise to the mini player.
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCollapse();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCollapse]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Player: ${title}`}
      className="fixed inset-0 z-40 mx-auto flex max-w-[430px] flex-col overflow-y-auto bg-ds-hero text-ds-on-hero"
      style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center blur-md"
        style={{ backgroundImage: `url(${roomArt(room)})` }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-ds-hero/80" />
      <div className="relative flex min-h-0 flex-1 flex-col gap-5 px-6 pb-8 pt-4">
        <div
          data-testid="player-grab"
          className="touch-none"
          onPointerDown={(e) => {
            dragStart.current = e.clientY;
          }}
          onPointerMove={(e) => {
            if (dragStart.current !== null) setDragY(Math.max(0, e.clientY - dragStart.current));
          }}
          onPointerUp={(e) => {
            const dy = dragStart.current === null ? 0 : e.clientY - dragStart.current;
            dragStart.current = null;
            setDragY(0);
            if (shouldDismissSwipe(dy)) onCollapse();
          }}
          onPointerCancel={() => {
            dragStart.current = null;
            setDragY(0);
          }}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Minimise player"
              className="grid size-11 place-items-center rounded-full bg-ds-on-hero/15"
            >
              <DsIcon name="chevron" className="size-6 rotate-90" />
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

          {lines ? (
            <div className="flex items-end gap-4">
              <div className="relative size-28 flex-none overflow-hidden rounded-3xl border-2 border-ds-on-hero/30">
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url(${roomArt(room)})` }}
                />
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <h2 className="font-display text-xl font-extrabold leading-tight">{title}</h2>
                <p className="mt-1 text-sm font-semibold text-ds-on-hero-soft">
                  Alphonso{aiNarrated ? ` · ${AI_NARRATED_LABEL}` : ""}
                </p>
              </div>
              <img
                src={talking}
                alt=""
                className={`-mr-2 w-20 flex-none ${isPlaying ? "mascot-breathe" : ""}`}
              />
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>

        {lines && !failed ? (
          <TimedTranscript lines={lines} elapsed={elapsed} onSeek={onSeek} />
        ) : null}

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
                onClick={() => setSleepOpen((o) => !o)}
                aria-expanded={sleepOpen}
                aria-label={sleepLabel}
                className="min-h-11 rounded-full bg-ds-on-hero/15 px-4 text-sm font-bold"
              >
                <span aria-hidden="true">☾ </span>
                {sleepLabel}
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
            {sleepOpen ? (
              <div
                role="radiogroup"
                aria-label="Sleep timer"
                className="flex flex-wrap justify-center gap-2"
              >
                {SLEEP_CHOICES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={sleep.choice === c.id}
                    onClick={() => {
                      setSleep(c.id === "off" ? SLEEP_OFF : startSleep(c.id, Date.now()));
                      setSleepOpen(false);
                    }}
                    className={`min-h-11 rounded-full px-4 text-sm font-bold ${
                      sleep.choice === c.id ? "bg-ds-action text-ds-on-action" : "bg-ds-on-hero/15"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
