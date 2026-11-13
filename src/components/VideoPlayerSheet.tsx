import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { track } from "../lib/analytics";
import { clock } from "../lib/listen-library";
import { usePodcastPlayer } from "../lib/podcast-player";
import { usePrefersReducedMotion } from "../lib/use-prefers-reduced-motion";
import {
  CAPTIONS_DEFAULT_ON,
  PRACTICE_LABEL,
  SAVE_EVERY_SECONDS,
  nextSpeed,
  practiceLink,
  resumeSeconds,
  speedLabel,
  type LibraryVideo,
  type PracticeLink,
} from "../lib/video-library";

const PRACTICE_CLASS =
  "min-h-12 rounded-2xl bg-ds-action px-4 py-3 text-base font-extrabold text-ds-on-action";

/** The one tap from the end of a video to its matching practice item. */
function PracticeButton({
  link,
  label,
  onGo,
}: {
  link: PracticeLink;
  label: string;
  onGo: () => void;
}) {
  if (link.to === "/lesson/$id")
    return (
      <Link to={link.to} params={link.params} onClick={onGo} className={PRACTICE_CLASS}>
        {label}
      </Link>
    );
  if (link.to === "/converse/$scenarioId")
    return (
      <Link to={link.to} params={link.params} onClick={onGo} className={PRACTICE_CLASS}>
        {label}
      </Link>
    );
  return (
    <Link
      to={link.to}
      params={link.params}
      search={link.search}
      onClick={onGo}
      className={PRACTICE_CLASS}
    >
      {label}
    </Link>
  );
}

/**
 * The Watch shelf's player sheet (mock mocks-r8, cell A3): a vertical video with play / pause, a scrubber, a speed
 * button and a captions button. Captions are ON when it opens, from the video's own WebVTT file. When the video ends the
 * sheet offers one tap to the matching practice item.
 *
 * Keyboard: the sheet is a modal dialog (focus kept inside, Escape closes), every control is a real button or a range
 * input, and the scrubber moves with the arrow keys. Reduced motion: the video does not start by itself.
 * Progress is saved at most every SAVE_EVERY_SECONDS while playing, and on pause, close and end.
 */
export function VideoPlayerSheet({
  video,
  onClose,
  onSaveProgress,
}: {
  video: LibraryVideo;
  onClose: () => void;
  /** Persists the position (the end of the video completes it). Failures are the caller's to swallow. */
  onSaveProgress: (seconds: number) => void;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSaved = useRef(0);
  const started = useRef(false);
  const completedTracked = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(video.durationSeconds);
  const [speed, setSpeed] = useState(1);
  const [captionsOn, setCaptionsOn] = useState(CAPTIONS_DEFAULT_ON);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const link = practiceLink(video.practice);

  const save = useCallback(
    (seconds: number) => {
      lastSaved.current = seconds;
      onSaveProgress(seconds);
    },
    [onSaveProgress],
  );

  // The caption track's mode follows the toggle (the default attribute only decides the first state).
  useEffect(() => {
    const el = videoRef.current;
    const track0 = el?.textTracks?.[0];
    if (track0) track0.mode = captionsOn ? "showing" : "hidden";
  }, [captionsOn, retryKey]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.playbackRate = speed;
  }, [speed, retryKey]);

  function onLoadedMetadata() {
    const el = videoRef.current;
    if (!el) return;
    if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
    const from = resumeSeconds(video);
    if (from > 0) el.currentTime = from;
    el.playbackRate = speed;
    const t = el.textTracks?.[0];
    if (t) t.mode = captionsOn ? "showing" : "hidden";
    if (!reduceMotion) void el.play().catch(() => undefined);
  }

  function toggle() {
    const el = videoRef.current;
    if (!el) return;
    if (ended) {
      el.currentTime = 0;
      setEnded(false);
    }
    if (el.paused) void el.play().catch(() => setFailed(true));
    else el.pause();
  }

  function close() {
    const el = videoRef.current;
    if (el && !ended && el.currentTime > 0) save(el.currentTime);
    onClose();
  }

  const titleId = `video-title-${video.id}`;
  const length = Math.max(1, Math.round(duration));

  return (
    <Modal
      labelledBy={titleId}
      onEscape={close}
      className="relative flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-t-3xl bg-ds-card sm:rounded-3xl"
    >
      <div data-testid="video-sheet" className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
          <h2
            id={titleId}
            className="min-w-0 truncate font-display text-lg font-extrabold text-ds-ink"
          >
            {video.title}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close video"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-ds-sunk text-lg font-extrabold text-ds-ink"
          >
            ×
          </button>
        </div>

        <div className="relative mx-auto aspect-[9/16] max-h-[60vh] w-auto overflow-hidden bg-ds-ink">
          <video
            key={retryKey}
            ref={videoRef}
            data-testid="video-element"
            className="size-full object-contain"
            src={video.videoUrl}
            poster={video.posterUrl ?? undefined}
            crossOrigin="anonymous"
            playsInline
            preload="metadata"
            onLoadedMetadata={onLoadedMetadata}
            onTimeUpdate={() => {
              const el = videoRef.current;
              if (!el) return;
              setTime(el.currentTime);
              if (!el.paused && el.currentTime - lastSaved.current >= SAVE_EVERY_SECONDS)
                save(el.currentTime);
            }}
            onPlay={() => {
              setPlaying(true);
              setEnded(false);
              // The persistent podcast <audio> must not keep playing under the video.
              usePodcastPlayer.getState().setPlaying(false);
              if (!started.current) {
                started.current = true;
                void track("video_started", { video_id: video.id, course: video.course });
              }
            }}
            onPause={() => {
              setPlaying(false);
              const el = videoRef.current;
              if (el && !el.ended && el.currentTime > 0) save(el.currentTime);
            }}
            onEnded={() => {
              setPlaying(false);
              setEnded(true);
              save(videoRef.current?.duration ?? duration);
              // Once per sheet session: a replay's end must not count as a second completion.
              if (!completedTracked.current) {
                completedTracked.current = true;
                void track("video_completed", { video_id: video.id, course: video.course });
              }
            }}
            onError={() => setFailed(true)}
          >
            <track
              kind="captions"
              src={video.captionsUrl}
              srcLang={video.course}
              label="Captions"
              default={CAPTIONS_DEFAULT_ON}
            />
          </video>

          {failed ? (
            <div className="absolute inset-0 grid place-content-center gap-3 bg-ds-ink/80 p-6 text-center text-ds-on-hero">
              <p className="text-sm font-semibold">We couldn&apos;t play this video.</p>
              <button
                type="button"
                onClick={() => {
                  setFailed(false);
                  setRetryKey((k) => k + 1);
                }}
                className="min-h-11 rounded-full bg-ds-on-hero/15 px-4 text-sm font-bold"
              >
                Try again
              </button>
            </div>
          ) : null}

          {ended && !failed ? (
            <div
              data-testid="video-end"
              className="absolute inset-0 grid place-content-center gap-3 bg-ds-ink/80 p-6 text-center text-ds-on-hero"
            >
              <p className="font-display text-xl font-extrabold">Nice work</p>
              {link && video.practice ? (
                <PracticeButton
                  link={link}
                  label={PRACTICE_LABEL[video.practice.kind]}
                  onGo={onClose}
                />
              ) : null}
              <button
                type="button"
                onClick={toggle}
                className="min-h-11 rounded-full bg-ds-on-hero/15 px-4 text-sm font-bold"
              >
                Watch again
              </button>
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 px-4 pb-4 pt-3">
          <input
            type="range"
            aria-label="Seek"
            aria-valuetext={`${clock(time)} of ${clock(length)}`}
            min={0}
            max={length}
            step={1}
            value={Math.min(Math.round(time), length)}
            onChange={(event) => {
              const el = videoRef.current;
              const next = Number(event.target.value);
              if (el) el.currentTime = next;
              setTime(next);
              setEnded(false);
            }}
            className="h-6 w-full accent-ds-action"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? "Pause" : "Play"}
              className="grid size-12 shrink-0 place-items-center rounded-full bg-ds-action text-lg font-extrabold text-ds-on-action"
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <span className="tnum min-w-0 flex-1 text-sm font-bold text-ds-ink-soft">
              {clock(time)} / {clock(length)}
            </span>
            <button
              type="button"
              onClick={() => setSpeed(nextSpeed(speed))}
              aria-label={`Playback speed ${speedLabel(speed)}. Change speed`}
              className="tnum min-h-11 min-w-14 rounded-full border border-ds-line bg-ds-card px-3 text-sm font-extrabold text-ds-ink"
            >
              {speedLabel(speed)}
            </button>
            <button
              type="button"
              onClick={() => setCaptionsOn((on) => !on)}
              aria-pressed={captionsOn}
              aria-label="Captions"
              className={`min-h-11 rounded-full border px-3 text-sm font-extrabold ${captionsOn ? "border-ds-action bg-ds-action text-ds-on-action" : "border-ds-line bg-ds-card text-ds-ink-soft"}`}
            >
              CC
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
