import { create } from "zustand";
import type { PodcastEpisode } from "./podcast.functions";
import { SLEEP_OFF, type SleepState } from "./sleep-timer";

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
  /** True once the episode has played to its end; the cue to offer its quiz. Cleared by anything that starts playback again. */
  finished: boolean;
  markFinished: () => void;
  /** Bumped by retry() so the audio element re-runs its load/play effect. */
  retryToken: number;
  /**
   * The scrubber's latest request. `token` changes on every call so seeking twice to the same second still
   * reaches the audio element, which applies it to currentTime (PodcastAudio.tsx).
   */
  seekRequest: { seconds: number; token: number } | null;
  /** The media element's own length, once it reports a usable one; the stored duration can disagree with the file. */
  mediaDuration: number | null;
  setMediaDuration: (seconds: number) => void;
  play: (episode: PodcastEpisode) => void;
  toggle: () => void;
  /** Mirrors the media element's own play/pause state back into the UI. */
  setPlaying: (isPlaying: boolean) => void;
  setElapsed: (seconds: number) => void;
  setFailed: (failed: boolean) => void;
  retry: () => void;
  /** Jump to a position; clamped to the episode, and the readout updates at once. */
  seek: (seconds: number) => void;
  /** Playback speed; the audio element applies it. */
  rate: number;
  setRate: (rate: number) => void;
  /** The sleep timer; PodcastAudio pauses playback when it fires. */
  sleep: SleepState;
  setSleep: (sleep: SleepState) => void;
  close: () => void;
};

export const usePodcastPlayer = create<PodcastPlayerState>((set) => ({
  episode: null,
  isPlaying: false,
  elapsedSeconds: 0,
  failed: false,
  finished: false,
  markFinished: () => set({ finished: true }),
  rate: 1,
  setRate: (rate) => set({ rate: [0.75, 1, 1.25, 1.5].includes(rate) ? rate : 1 }),
  retryToken: 0,
  seekRequest: null,
  mediaDuration: null,
  setMediaDuration: (seconds) =>
    set({ mediaDuration: Number.isFinite(seconds) && seconds > 0 ? seconds : null }),
  play: (episode) =>
    set({
      episode,
      isPlaying: true,
      elapsedSeconds: episode.positionSeconds ?? 0,
      failed: false,
      finished: false,
      seekRequest: null,
      mediaDuration: null,
    }),
  toggle: () => set((state) => ({ isPlaying: !state.isPlaying, finished: false })),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setElapsed: (seconds) => set({ elapsedSeconds: seconds }),
  setFailed: (failed) => set({ failed }),
  retry: () =>
    set((state) => ({
      failed: false,
      finished: false,
      isPlaying: true,
      retryToken: state.retryToken + 1,
    })),
  seek: (seconds) =>
    set((state) => {
      if (!state.episode) return {};
      const length = state.mediaDuration ?? state.episode.durationSeconds;
      const max = length > 0 ? length : seconds;
      const clamped = Math.min(Math.max(Number.isFinite(seconds) ? seconds : 0, 0), max);
      return {
        elapsedSeconds: clamped,
        seekRequest: { seconds: clamped, token: (state.seekRequest?.token ?? 0) + 1 },
      };
    }),
  sleep: SLEEP_OFF,
  setSleep: (sleep) => set({ sleep }),
  close: () =>
    set({
      sleep: SLEEP_OFF,
      episode: null,
      isPlaying: false,
      elapsedSeconds: 0,
      failed: false,
      finished: false,
      seekRequest: null,
      mediaDuration: null,
    }),
}));

/** m:ss, the format the episode list and the player both render. */
export function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.round(totalSeconds) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
