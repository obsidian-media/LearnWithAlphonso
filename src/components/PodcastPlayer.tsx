import { useCallback, useEffect, useRef, useState } from "react";
import { formatDuration, usePodcastPlayer } from "../lib/podcast-player";
import { recordPlayEvent, savePlaybackPosition } from "../lib/podcast.functions";

/** How often a position is written back while audio plays. */
const SAVE_INTERVAL_SECONDS = 10;

/**
 * The podcast mini-player. Mounted ONCE in AppShell, above BottomTabs --
 * never inside a route component. A route-owned audio element unmounts
 * when the learner walks from a folder into a subfolder, which stops
 * playback dead; that is the most common way this class of feature ends
 * up broken, and it is free to avoid here and painful to retrofit.
 *
 * Renders nothing at all until an episode is loaded.
 */
export function PodcastPlayer() {
  const { episode, isPlaying, toggle, close } = usePodcastPlayer();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSavedRef = useRef(0);
  const [failed, setFailed] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const episodeId = episode?.id ?? null;

  // A new episode starts a fresh error/elapsed state; re-renders of the
  // surrounding page do not.
  useEffect(() => {
    setFailed(false);
    setElapsed(0);
    lastSavedRef.current = 0;
  }, [episodeId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      // play() resolves to a Promise in modern browsers but is specified
      // to return undefined in older ones -- and jsdom returns undefined
      // too, so calling .catch() unguarded throws rather than handling
      // the failure it was meant to handle.
      const started = audio.play() as Promise<void> | undefined;
      started?.catch(() => setFailed(true));
    } else {
      audio.pause();
    }
  }, [isPlaying, episodeId]);

  const persist = useCallback(
    (seconds: number) => {
      if (!episodeId) return;
      // Best-effort, the same posture as the iOS app's theme hydration:
      // a failed write leaves the last known position alone rather than
      // resetting it, and never interrupts playback.
      void savePlaybackPosition({ data: { episodeId, positionSeconds: seconds } }).catch(() => {});
    },
    [episodeId],
  );

  if (!episode) return null;

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setElapsed(audio.currentTime);
    if (audio.currentTime - lastSavedRef.current >= SAVE_INTERVAL_SECONDS) {
      lastSavedRef.current = audio.currentTime;
      persist(audio.currentTime);
    }
  };

  const onEnded = () => {
    persist(0);
    void recordPlayEvent({
      data: { episodeId: episode.id, secondsListened: episode.durationSeconds },
    }).catch(() => {});
  };

  const retry = () => {
    setFailed(false);
    audioRef.current?.load();
  };

  return (
    <div className="sticky bottom-0 z-30 border-t border-hairline bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[430px] items-center gap-3 px-5 py-3">
        <audio
          ref={audioRef}
          data-testid="podcast-audio"
          data-start-at={episode.positionSeconds}
          src={episode.audioUrl}
          preload="metadata"
          onLoadedMetadata={() => {
            const audio = audioRef.current;
            if (audio && episode.positionSeconds > 0) audio.currentTime = episode.positionSeconds;
          }}
          onTimeUpdate={onTimeUpdate}
          onError={() => setFailed(true)}
          onPause={() => persist(audioRef.current?.currentTime ?? 0)}
          onEnded={onEnded}
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{episode.title}</p>
          {failed ? (
            <p className="text-xs text-rose-600">We couldn&apos;t play this episode.</p>
          ) : (
            <p className="tnum text-xs text-ink-soft/70">
              {formatDuration(elapsed)} / {formatDuration(episode.durationSeconds)}
            </p>
          )}
        </div>

        {failed ? (
          <button
            type="button"
            onClick={retry}
            className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink"
          >
            Try again
          </button>
        ) : (
          <button
            type="button"
            onClick={toggle}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="rounded-full bg-moss px-3 py-1.5 text-xs font-semibold text-white"
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            persist(audioRef.current?.currentTime ?? 0);
            close();
          }}
          aria-label="Close player"
          className="text-ink-soft/60"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
