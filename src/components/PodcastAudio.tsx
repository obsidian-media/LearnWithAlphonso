import { useCallback, useEffect, useRef } from "react";
import { usePodcastPlayer } from "../lib/podcast-player";

/** How often a position is written back while audio plays. */
const SAVE_INTERVAL_SECONDS = 10;

/**
 * The persistent <audio> element. Mounted ONCE beside the router's
 * Outlet in routes/_authenticated/route.tsx -- deliberately NOT inside
 * MobileFrame, which is a component each page renders for itself: an
 * element mounted there unmounts the moment a learner walks from a
 * folder into a subfolder, killing playback mid-episode and losing the
 * position with it.
 *
 * Renders no UI at all. The visible mini-bar (PodcastPlayer.tsx) reads
 * the same store and is free to remount as pages change.
 *
 * The server functions are imported lazily rather than at module scope:
 * a static import would pull the Supabase auth middleware into the
 * import graph of every authenticated page. Same pattern
 * review.functions.ts uses for supabaseAdmin.
 */
async function podcastApi() {
  return import("../lib/podcast.functions");
}

export function PodcastAudio() {
  const episode = usePodcastPlayer((state) => state.episode);
  const isPlaying = usePodcastPlayer((state) => state.isPlaying);
  const retryToken = usePodcastPlayer((state) => state.retryToken);
  const setPlaying = usePodcastPlayer((state) => state.setPlaying);
  const setElapsed = usePodcastPlayer((state) => state.setElapsed);
  const setFailed = usePodcastPlayer((state) => state.setFailed);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSavedRef = useRef(0);
  /** Seconds actually listened this session, for the play event. */
  const listenedRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);

  const episodeId = episode?.id ?? null;

  const persist = useCallback((id: string, seconds: number, completed: boolean) => {
    // Best-effort, the same posture as the iOS app's theme hydration: a
    // failed write leaves the last known position alone rather than
    // resetting it, and never interrupts playback.
    void podcastApi()
      .then(({ savePlaybackPosition }) =>
        savePlaybackPosition({
          data: { episodeId: id, positionSeconds: seconds, completed },
        }),
      )
      .catch(() => {});
  }, []);

  const flushPlayEvent = useCallback((id: string) => {
    const listened = Math.round(listenedRef.current);
    listenedRef.current = 0;
    if (listened <= 0) return;
    void podcastApi()
      .then(({ recordPlayEvent }) =>
        recordPlayEvent({ data: { episodeId: id, secondsListened: listened } }),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    lastSavedRef.current = 0;
    listenedRef.current = 0;
    lastTickRef.current = null;
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
  }, [isPlaying, episodeId, retryToken, setFailed]);

  // A play session that ends by navigating away, closing the tab, or
  // simply stopping is still a play session. Without this, the only
  // event ever recorded is a completed episode, and abandonment -- the
  // signal that tells you an episode is too long or too dull -- is
  // invisible.
  useEffect(() => {
    if (!episodeId) return;
    return () => {
      flushPlayEvent(episodeId);
    };
  }, [episodeId, flushPlayEvent]);

  useEffect(() => {
    const onUnload = () => {
      const audio = audioRef.current;
      if (episodeId && audio) persist(episodeId, audio.currentTime, false);
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [episodeId, persist]);

  if (!episode) return null;

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const now = audio.currentTime;
    setElapsed(now);

    // Accumulate real listening time, ignoring jumps caused by seeking.
    const previous = lastTickRef.current;
    if (previous !== null) {
      const delta = now - previous;
      if (delta > 0 && delta < 2) listenedRef.current += delta;
    }
    lastTickRef.current = now;

    // Math.abs, not a bare subtraction: after a backward seek the
    // difference stays negative until playback climbs back past the old
    // mark, which would silently stop saving for minutes.
    if (Math.abs(now - lastSavedRef.current) >= SAVE_INTERVAL_SECONDS) {
      lastSavedRef.current = now;
      persist(episode.id, now, false);
    }
  };

  const onLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const start = episode.positionSeconds;
    if (start <= 0) return;
    // Clamp against the MEDIA's duration, not the stored
    // duration_seconds: the row can disagree with the file (a replaced
    // object, or a concatenated TTS episode whose reported length was
    // wrong), and the media is the only length we can actually seek in.
    const real = audio.duration;
    if (Number.isFinite(real) && real > 0 && start >= real - 1) return;
    audio.currentTime = start;
  };

  const onEnded = () => {
    setPlaying(false);
    setElapsed(0);
    persist(episode.id, 0, true);
    flushPlayEvent(episode.id);
  };

  // The a11y rule below asks for a <track>, and this element still has none.
  // What it is protecting against -- audio-only content being unavailable to
  // deaf and hard-of-hearing learners -- is now addressed by a different
  // means: Phase 2a added per-episode transcripts, reachable from the
  // mini-player's "Text" button while an episode plays (PodcastTranscript.tsx,
  // supabase/migrations/20260927230000_podcast_transcripts.sql).
  //
  // A real <track> needs timed cues, which need forced alignment between the
  // text and the audio -- a separate problem with separate dependencies.
  // Pointing <track> at a file that does not exist would satisfy the linter
  // while claiming captions exist, which is worse than a stated gap.
  //
  // So what remains here is narrower than it was: no synchronised captions,
  // rather than no text at all. Still worth doing; no longer an exclusion.
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio
      ref={audioRef}
      data-testid="podcast-audio"
      src={episode.audioUrl}
      preload="metadata"
      onLoadedMetadata={onLoadedMetadata}
      onTimeUpdate={onTimeUpdate}
      onError={() => setFailed(true)}
      onPlay={() => setPlaying(true)}
      onPause={() => {
        setPlaying(false);
        const audio = audioRef.current;
        if (audio) persist(episode.id, audio.currentTime, false);
      }}
      onEnded={onEnded}
    />
  );
}
