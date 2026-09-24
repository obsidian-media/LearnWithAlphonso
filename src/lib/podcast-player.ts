import { create } from "zustand";
import type { PodcastEpisode } from "./podcast.functions";

/**
 * Playback state for the podcast mini-player (Phase 1a, see
 * docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md).
 *
 * The state lives here, outside the route tree, because the audio
 * element it drives is mounted once in AppShell. Navigating from a
 * folder into a subfolder re-renders the page but must not interrupt
 * playback -- keeping the state in a route component is exactly how
 * that breaks.
 */
type PodcastPlayerState = {
  episode: PodcastEpisode | null;
  isPlaying: boolean;
  positionSeconds: number;
  play: (episode: PodcastEpisode) => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  close: () => void;
};

export const usePodcastPlayer = create<PodcastPlayerState>((set) => ({
  episode: null,
  isPlaying: false,
  positionSeconds: 0,
  play: (episode) =>
    set({ episode, isPlaying: true, positionSeconds: episode.positionSeconds ?? 0 }),
  toggle: () => set((state) => ({ isPlaying: !state.isPlaying })),
  seek: (seconds) => set({ positionSeconds: seconds }),
  close: () => set({ episode: null, isPlaying: false, positionSeconds: 0 }),
}));

/** m:ss, the format the episode list and the player both render. */
export function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.round(totalSeconds) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
