import { useEffect, useRef, useState } from "react";
import { useProgress } from "../lib/progress";
import { transcriptSaveCourse } from "../lib/podcast-tree";
import { AI_NARRATED_LABEL } from "../lib/podcast-label";
import { formatDuration, usePodcastPlayer } from "../lib/podcast-player";
import type { SavedWordCourse } from "../lib/saved-word";
import type { PodcastQuizOffer } from "../lib/podcast-quiz.functions";
import { PodcastQuiz } from "./PodcastQuiz";
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
  const seek = usePodcastPlayer((state) => state.seek);
  const mediaDuration = usePodcastPlayer((state) => state.mediaDuration);
  const close = usePodcastPlayer((state) => state.close);
  const finished = usePodcastPlayer((state) => state.finished);

  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const activeCourse = useProgress((s) => s.course);
  // Null until the folders are read; the active course stands in, never a fixed one.
  const [episodeCourse, setEpisodeCourse] = useState<SavedWordCourse | null>(null);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);

  const [offer, setOffer] = useState<PodcastQuizOffer | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);

  const episodeId = episode?.id ?? null;
  const folderId = episode?.folderId ?? null;
  const ownCourse = episode?.course ?? null;

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
        const { fetchTranscript, listFolders } = await import("../lib/podcast.functions");
        // In parallel, and the folder read is skipped when the episode carries its own course.
        const [folders, text] = await Promise.all([
          ownCourse ? null : listFolders().catch(() => null),
          fetchTranscript({ data: { episodeId } }),
        ]);
        if (!cancelled) {
          setEpisodeCourse(
            transcriptSaveCourse(folders ?? [], folderId ?? "", activeCourse, ownCourse),
          );
          setTranscript(text);
        }
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
  }, [showTranscript, episodeId, folderId, ownCourse, activeCourse]);

  // The quiz is offered when an episode has played to its end, and only if it has one (and the learner can see it).
  // Plain state and a dynamic import for the same reason as the transcript above.
  useEffect(() => {
    setQuizOpen(false);
    if (!finished || !episodeId) {
      setOffer(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { fetchPodcastQuiz } = await import("../lib/podcast-quiz.functions");
        const found = await fetchPodcastQuiz({ data: { episodeId } });
        if (!cancelled) setOffer(found);
      } catch {
        // No offer is the quiet failure: the episode itself is unaffected.
        if (!cancelled) setOffer(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [finished, episodeId]);

  if (!episode) return null;

  return (
    <>
      {showTranscript ? (
        <PodcastTranscriptPanel
          title={episode.title}
          transcript={transcript}
          course={episodeCourse ?? activeCourse}
          isLoading={isLoadingTranscript}
          onClose={() => setShowTranscript(false)}
        />
      ) : null}
      {finished && offer ? (
        <div className="sticky bottom-0 z-30 border-t border-hairline bg-surface/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-[430px] items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Test what you heard</p>
              <p className="text-xs text-ink-soft/70">
                {offer.questions.length} questions · 10 XP for each correct answer
                {offer.best
                  ? ` · your best: ${offer.best.correct} of ${offer.questions.length}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQuizOpen(true)}
              className="rounded-full bg-moss px-3 py-1.5 text-xs font-semibold text-white"
            >
              Take the quiz
            </button>
          </div>
        </div>
      ) : null}
      {quizOpen && offer ? (
        <PodcastQuiz
          title={episode.title}
          episodeId={episode.id}
          course={ownCourse ?? activeCourse}
          questions={offer.questions}
          best={offer.best}
          onClose={() => setQuizOpen(false)}
        />
      ) : null}
      <div className="sticky bottom-0 z-30 border-t border-hairline bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[430px] items-center gap-3 px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{episode.title}</p>
            {episode.aiNarrated ? (
              <p className="text-xs text-ink-soft/70">{AI_NARRATED_LABEL}</p>
            ) : null}
            {failed ? (
              <p className="text-xs text-rose-600">We couldn&apos;t play this episode.</p>
            ) : (
              <Scrubber
                elapsed={elapsedSeconds}
                duration={mediaDuration ?? episode.durationSeconds}
                onSeek={seek}
              />
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

const ARROW_STEP_SECONDS = 5;
const PAGE_STEP_SECONDS = 30;

/**
 * Seek bar with elapsed on the left and time remaining on the right (the iOS mini-bar has a Slider too).
 * A native range input, so pointer, touch and assistive-technology adjustment all work; the keys are
 * overridden only to take bigger steps than one second, which is useless on a five-minute episode.
 * Nothing here animates, so there is no motion for Reduce Motion to remove. A drag moves only the readout;
 * the seek happens once on release, so the audio element is not flooded with requests.
 */
function Scrubber({
  elapsed,
  duration,
  onSeek,
}: {
  elapsed: number;
  duration: number;
  onSeek: (seconds: number) => void;
}) {
  const max = duration > 0 ? Math.round(duration) : 0;
  const value = Math.min(Math.max(Math.round(elapsed), 0), max);
  const [draft, setDraft] = useState<number | null>(null);
  const dragging = useRef(false);
  const shown = draft ?? value;
  const remaining = Math.max(max - shown, 0);

  const commit = () => {
    dragging.current = false;
    if (draft !== null) onSeek(draft);
    setDraft(null);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const delta: Record<string, number> = {
      ArrowRight: ARROW_STEP_SECONDS,
      ArrowUp: ARROW_STEP_SECONDS,
      ArrowLeft: -ARROW_STEP_SECONDS,
      ArrowDown: -ARROW_STEP_SECONDS,
      PageUp: PAGE_STEP_SECONDS,
      PageDown: -PAGE_STEP_SECONDS,
    };
    if (event.key === "Home") onSeek(0);
    else if (event.key === "End") onSeek(max);
    else if (event.key in delta) onSeek(value + delta[event.key]);
    else return;
    event.preventDefault();
  };

  return (
    <div className="mt-1 flex items-center gap-2">
      <span className="tnum w-9 shrink-0 text-xs text-ink-soft/70">{formatDuration(shown)}</span>
      <input
        type="range"
        aria-label="Seek"
        aria-valuetext={`${formatDuration(shown)} of ${formatDuration(max)}`}
        min={0}
        max={max}
        step={1}
        value={shown}
        disabled={max === 0}
        onPointerDown={() => {
          dragging.current = true;
        }}
        onPointerUp={commit}
        onPointerCancel={commit}
        onChange={(event) => {
          const next = Number(event.target.value);
          // Without a pointer drag (assistive technology, a click on the track) there is no release to wait for.
          if (dragging.current) setDraft(next);
          else onSeek(next);
        }}
        onKeyDown={onKeyDown}
        className="h-6 min-w-0 flex-1 cursor-pointer accent-moss focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/60 rounded-full"
      />
      <span className="tnum w-10 shrink-0 text-right text-xs text-ink-soft/70">
        -{formatDuration(remaining)}
      </span>
    </div>
  );
}
