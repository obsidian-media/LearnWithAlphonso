import { create } from "zustand";

import type { LeagueTier } from "../data/achievements";
import type { Course } from "../data/courses";
import { MAX_HEARTS } from "./hearts";

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export type ProgressState = {
  /** Which course's lessons/xp/level the rest of this store reflects. */
  course: Course;
  setCourse: (course: Course) => void;
  xp: number;
  streak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  hearts: number;
  heartsRefillAt: number | null;
  streakFreezes: number;
  leagueTier: LeagueTier;
  completedLessons: string[];
  answersByLesson: Record<string, { correct: number; total: number }>;
  activityDates: string[];
  unlockedAchievements: string[];
  cefrLevel: string;
  placementLevel: string | null;
  placementScore: number | null;
  placementTakenAt: string | null;
  setCefrLevelLocal: (level: string) => void;
  setPlacementLocal: (p: {
    cefrLevel: string;
    placementLevel: string;
    placementScore: number;
    placementTakenAt: string;
  }) => void;
  hydrated: boolean;
  loading: boolean;
  setLoading: (v: boolean) => void;
  hydrate: (input: Partial<ProgressState>) => void;
  applyCompletion: (patch: {
    xp: number;
    streak: number;
    longestStreak: number;
    hearts: number;
    heartsRefillAt?: number | null;
    streakFreezes: number;
    leagueTier: LeagueTier;
    lastActiveDate: string;
    completedLessons: string[];
    activityDates: string[];
    answersByLesson: Record<string, { correct: number; total: number }>;
    unlockedAchievements: string[];
  }) => void;
  loseHeartLocal: () => void;
  restoreHeartsLocal: () => void;
  gainHeartsLocal: (amount: number) => void;
  spendXpForHeartLocal: (cost: number) => void;
  reset: () => void;
};

const initial = {
  xp: 0,
  streak: 0,
  longestStreak: 0,
  lastActiveDate: null as string | null,
  hearts: 5,
  heartsRefillAt: null as number | null,
  streakFreezes: 0,
  leagueTier: "bronze" as LeagueTier,
  completedLessons: [] as string[],
  answersByLesson: {} as Record<string, { correct: number; total: number }>,
  activityDates: [] as string[],
  unlockedAchievements: [] as string[],
  cefrLevel: "A1",
  placementLevel: null as string | null,
  placementScore: null as number | null,
  placementTakenAt: null as string | null,
};

export const useProgress = create<ProgressState>()((set) => ({
  ...initial,
  course: "en",
  setCourse: (course) => set({ course }),
  hydrated: false,
  loading: false,
  setLoading: (v) => set({ loading: v }),
  setCefrLevelLocal: (level) => set({ cefrLevel: level }),
  setPlacementLocal: (p) => set({ ...p }),
  hydrate: (input) => set({ ...initial, ...input, hydrated: true, loading: false }),
  applyCompletion: (patch) => set((s) => ({ ...s, ...patch })),
  loseHeartLocal: () =>
    set((s) => ({
      hearts: Math.max(0, s.hearts - 1),
      heartsRefillAt: s.hearts - 1 <= 0 ? Date.now() + 30 * 60 * 1000 : s.heartsRefillAt,
    })),
  restoreHeartsLocal: () => set({ hearts: MAX_HEARTS, heartsRefillAt: null }),
  gainHeartsLocal: (amount) =>
    set((s) => ({ hearts: Math.min(MAX_HEARTS, s.hearts + amount), heartsRefillAt: null })),
  spendXpForHeartLocal: (cost) =>
    set((s) => ({
      hearts: Math.min(MAX_HEARTS, s.hearts + 1),
      heartsRefillAt: null,
      xp: Math.max(0, s.xp - cost),
    })),
  // `course` is deliberately not part of `initial` -- hydrate() spreads
  // `...initial` too, and must NOT reset course there (switchCourse calls
  // setCourse() immediately before hydrate() with the just-fetched
  // snapshot). reset() has no such constraint, so it restores course here
  // explicitly instead.
  reset: () => set({ ...initial, course: "en", hydrated: true }),
}));
