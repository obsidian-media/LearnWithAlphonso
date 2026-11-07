import { useEffect, useRef, useState } from "react";
import { useProgress } from "../lib/progress";
import { transcriptSaveCourse } from "../lib/podcast-tree";
import { AI_NARRATED_LABEL } from "../lib/podcast-label";
import { formatDuration, usePodcastPlayer } from "../lib/podcast-player";
import type { SavedWordCourse } from "../lib/saved-word";
import type { PodcastQuizOffer } from "../lib/podcast-quiz.functions";
import { PodcastQuiz } from "./PodcastQuiz";
import { roomArt } from "./ListenLibrary";
import { FullPlayer } from "./FullPlayer";
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
  const [expanded, setExpanded] = useState(false);
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
  const room = episode.room ?? "radio";
  const length = mediaDuration ?? episode.durationSeconds;

  return (
    <>
      {expanded ? (
        <FullPlayer
          room={room}
          title={episode.title}
          aiNarrated={episode.aiNarrated}
          elapsed={elapsedSeconds}
          duration={mediaDuration ?? episode.durationSeconds}
          isPlaying={isPlaying}
          failed={failed}
          onToggle={toggle}
          onRetry={retry}
          onSeek={seek}
          onTranscript={() => setShowTranscript(true)}
          onCollapse={() => setExpanded(false)}
          onClose={() => {
            setExpanded(false);
            close();
          }}
        />
      ) : null}
      {showTranscript ? (
        <PodcastTranscriptPanel
          title={episode.title}
          transcript={transcript}
          course={episodeCourse ?? activeCourse}
          isLoading={isLoadingTranscript}
          onClose={() => setShowTranscript(false)}
        />
      ) : null}
      {quizOpen && offer ? (
        <PodcastQuiz
          title={episode.title}
          episodeId={episode.id}
          course={ownCourse ?? activeCourse}
          questions={offer.questions}
          best={offer.best}
          onClose={() => setQuizOpen(false)}
          // The offer's "best" label follows a better run without another read.
          onSaved={(result) =>
            setOffer((current) =>
              current
                ? { ...current, best: { correct: result.bestCorrect, xp: result.bestXp } }
                : current,
            )
          }
        />
      ) : null}
      <div className="sticky bottom-0 z-30 px-3 pb-2">
        {/* Inside the player bar, not a sibling: sticky siblings pinned to the same edge cover one another. */}
        {finished && offer ? (
          <div
            data-testid="quiz-offer"
            className="mx-auto mb-2 flex max-w-[430px] items-center gap-3 rounded-2xl border border-ds-line bg-ds-card px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ds-ink">Test what you heard</p>
              <p className="text-xs text-ds-ink-soft/70">
                {offer.questions.length} questions · 10 XP for each correct answer
                {offer.best
                  ? ` · your best: ${offer.best.correct} of ${offer.questions.length}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQuizOpen(true)}
              className="rounded-full bg-ds-brand px-3 py-1.5 text-xs font-semibold text-white"
            >
              Take the quiz
            </button>
          </div>
        ) : null}
        <div className="relative mx-auto flex max-w-[430px] items-center gap-3 overflow-hidden rounded-2xl bg-ds-hero px-3 py-2.5 text-ds-on-hero">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={`Open player: ${episode.title}`}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span
              aria-hidden="true"
              className="size-11 shrink-0 rounded-xl bg-cover bg-center"
              style={{ backgroundImage: `url(${roomArt(room)})` }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-extrabold">{episode.title}</span>
              {failed ? (
                <span className="block text-xs text-ds-on-hero-soft">
                  We couldn&apos;t play this episode.
                </span>
              ) : (
                <span className="block text-xs text-ds-on-hero-soft">
                  Alphonso · {formatDuration(Math.max(length - Math.round(elapsedSeconds), 0))} left
                  {episode.aiNarrated ? ` · ${AI_NARRATED_LABEL}` : ""}
                </span>
              )}
            </span>
          </button>
          {failed ? (
            <button
              type="button"
              onClick={retry}
              className="rounded-full bg-ds-on-hero/15 px-3 py-1.5 text-xs font-bold"
            >
              Try again
            </button>
          ) : (
            <button
              type="button"
              onClick={toggle}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="grid size-11 place-items-center rounded-full bg-ds-action text-ds-on-action"
            >
              <span aria-hidden="true">{isPlaying ? "❚❚" : "▶"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={close}
            aria-label="Close player"
            className="grid size-9 place-items-center text-ds-on-hero-soft"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </button>
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-ds-on-hero/20" aria-hidden="true">
            <div
              className="h-full bg-ds-xp"
              style={{ width: `${length > 0 ? Math.min(100, (elapsedSeconds / length) * 100) : 0}%` }}
            />
          </div>
        </div>
      </div>
    </>
  );
}
