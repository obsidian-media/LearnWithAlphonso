import { useEffect, useState } from "react";
import { formatDuration, usePodcastPlayer } from "../lib/podcast-player";
import { PodcastTranscriptPanel } from "./PodcastTranscript";

/**
 * The visible mini-player bar, docked above the bottom tabs.
 *
 * Pure UI: it owns no audio element and no playback state. The <audio>
 * element lives in PodcastAudio.tsx, mounted beside the router's Outlet,
 * so this bar is free to unmount and remount as pages change without
 * interrupting anything. Renders nothing until an episode is loaded.
 */
export function PodcastPlayer() {
  const episode = usePodcastPlayer((state) => state.episode);
  const isPlaying = usePodcastPlayer((state) => state.isPlaying);
  const elapsedSeconds = usePodcastPlayer((state) => state.elapsedSeconds);
  const failed = usePodcastPlayer((state) => state.failed);
  const toggle = usePodcastPlayer((state) => state.toggle);
  const retry = usePodcastPlayer((state) => state.retry);
  const close = usePodcastPlayer((state) => state.close);

  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);

  const episodeId = episode?.id ?? null;

  // Plain state rather than useQuery, deliberately. This bar is mounted in
  // AppShell, so a TanStack Query dependency here would require a
  // QueryClientProvider around every page -- and every test -- that renders
  // the shell. Same class of coupling as a static import of the server
  // functions pulling the Supabase auth middleware into every page's graph.
  //
  // Fetched only when the panel opens: a transcript is kilobytes of text
  // nobody needs while they are simply listening.
  useEffect(() => {
    if (!showTranscript || !episodeId) return;
    let cancelled = false;
    setIsLoadingTranscript(true);
    void (async () => {
      try {
        const { fetchTranscript } = await import("../lib/podcast.functions");
        const text = await fetchTranscript({ data: { episodeId } });
        if (!cancelled) setTranscript(text);
      } catch {
        // The panel shows "no transcript" either way. Distinguishing a
        // missing transcript from a failed fetch would be better, and is
        // worth doing when there is a second reason for one to be absent.
        if (!cancelled) setTranscript(null);
      } finally {
        if (!cancelled) setIsLoadingTranscript(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showTranscript, episodeId]);

  if (!episode) return null;

  return (
    <>
      {showTranscript ? (
        <PodcastTranscriptPanel
          title={episode.title}
          transcript={transcript}
          isLoading={isLoadingTranscript}
          onClose={() => setShowTranscript(false)}
        />
      ) : null}
      <div className="sticky bottom-0 z-30 border-t border-hairline bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[430px] items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{episode.title}</p>
            {failed ? (
              <p className="text-xs text-rose-600">We couldn&apos;t play this episode.</p>
            ) : (
              <p className="tnum text-xs text-ink-soft/70">
                {formatDuration(elapsedSeconds)} / {formatDuration(episode.durationSeconds)}
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

          {/* The accessibility affordance, always present rather than hidden
            when an episode has no transcript: hiding it would make the gap
            invisible instead of stated. */}
          <button
            type="button"
            onClick={() => setShowTranscript(true)}
            aria-label="Show transcript"
            className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink"
          >
            Text
          </button>

          <button
            type="button"
            onClick={close}
            aria-label="Close player"
            className="text-ink-soft/60"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
