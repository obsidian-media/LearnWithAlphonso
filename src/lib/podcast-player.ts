import { create } from "zustand";
import type { PodcastEpisode } from "./podcast.functions";

/**
 * Playback state for the podcast player (Phase 1a, see
 * docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md).
 *
 * The state lives here, outside the route tree, because the <audio>
 * element it drives is mounted beside the router's Outlet rather than
 * inside a page (see PodcastAudio.tsx). The mini-bar UI may remount
 * freely as pages change; the element and this state must not.
 *
 * `elapsedSeconds` is pushed from the element on every timeupdate so
 * that anything which does remount can resume from where playback
 * actually got to, not from where it started.
 */
type PodcastPlayerState = {
  episode: PodcastEpisode | null;
  isPlaying: boolean;
  elapsedSeconds: number;
  failed: boolean;
  /** Bumped by retry() so the audio element re-runs its load/play effect. */
  retryToken: number;
  /**
   * The scrubber's latest request. `token` changes on every call so seeking twice to the same second still
   * reaches the audio element, which applies it to currentTime (PodcastAudio.tsx).
   */
  seekRequest: { seconds: number; token: number } | null;
  play: (episode: PodcastEpisode) => void;
  toggle: () => void;
  /** Mirrors the media element's own play/pause state back into the UI. */
  setPlaying: (isPlaying: boolean) => void;
  setElapsed: (seconds: number) => void;
  setFailed: (failed: boolean) => void;
  retry: () => void;
  /** Jump to a position; clamped to the episode, and the readout updates at once. */
  seek: (seconds: number) => void;
  close: () => void;
};

export const usePodcastPlayer = create<PodcastPlayerState>((set) => ({
  episode: null,
  isPlaying: false,
  elapsedSeconds: 0,
  failed: false,
  retryToken: 0,
  seekRequest: null,
  play: (episode) =>
    set({
      episode,
      isPlaying: true,
      elapsedSeconds: episode.positionSeconds ?? 0,
      failed: false,
      seekRequest: null,
    }),
  toggle: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setElapsed: (seconds) => set({ elapsedSeconds: seconds }),
  setFailed: (failed) => set({ failed }),
  retry: () =>
    set((state) => ({ failed: false, isPlaying: true, retryToken: state.retryToken + 1 })),
  seek: (seconds) =>
    set((state) => {
      if (!state.episode) return {};
      const max = state.episode.durationSeconds > 0 ? state.episode.durationSeconds : seconds;
      const clamped = Math.min(Math.max(Number.isFinite(seconds) ? seconds : 0, 0), max);
      return {
        elapsedSeconds: clamped,
        seekRequest: { seconds: clamped, token: (state.seekRequest?.token ?? 0) + 1 },
      };
    }),
  close: () =>
    set({ episode: null, isPlaying: false, elapsedSeconds: 0, failed: false, seekRequest: null }),
}));

/** m:ss, the format the episode list and the player both render. */
export function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.round(totalSeconds) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
