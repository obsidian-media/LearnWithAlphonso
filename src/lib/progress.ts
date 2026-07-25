import { create } from "zustand";

import type { LeagueTier } from "../data/achievements";

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export type ProgressState = {
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
  hydrated: boolean;
  loading: boolean;
  setLoading: (v: boolean) => void;
  hydrate: (input: Partial<ProgressState>) => void;
  applyCompletion: (patch: {
    xp: number;
    streak: number;
    longestStreak: number;
    hearts: number;
    streakFreezes: number;
    leagueTier: LeagueTier;
    lastActiveDate: string;
    completedLessons: string[];
    activityDates: string[];
    answersByLesson: Record<string, { correct: number; total: number }>;
    unlockedAchievements: string[];
  }) => void;
  loseHeartLocal: () => void;
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
};

export const useProgress = create<ProgressState>()((set) => ({
  ...initial,
  hydrated: false,
  loading: false,
  setLoading: (v) => set({ loading: v }),
  hydrate: (input) => set({ ...initial, ...input, hydrated: true, loading: false }),
  applyCompletion: (patch) => set((s) => ({ ...s, ...patch })),
  loseHeartLocal: () =>
    set((s) => ({
      hearts: Math.max(0, s.hearts - 1),
      heartsRefillAt:
        s.hearts - 1 <= 0 ? Date.now() + 30 * 60 * 1000 : s.heartsRefillAt,
    })),
  reset: () => set({ ...initial, hydrated: true }),
}));