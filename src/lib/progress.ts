import { create } from "zustand";

import type { LeagueTier } from "../data/achievements";
import type { Course } from "../data/courses";
import { gainHearts, loseHeart, resolveHeartsRefill } from "./hearts";

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The course a learner was last studying, kept per account in this browser. Without it every reload (and every
 * SIGNED_IN that supabase-js re-emits when a hidden tab comes back) started a French or Spanish learner on English.
 */
export const COURSE_KEY_PREFIX = "lwa.course.v1.";

export function rememberedCourse(userId: string): Course | null {
  try {
    const v = window.localStorage.getItem(COURSE_KEY_PREFIX + userId);
    return v === "en" || v === "fr" || v === "es" ? v : null;
  } catch {
    return null; // storage blocked, or no window (server render)
  }
}

function rememberCourse(userId: string, course: Course) {
  try {
    window.localStorage.setItem(COURSE_KEY_PREFIX + userId, course);
  } catch {
    // storage blocked: the choice still holds for this visit
  }
}

export type ProgressState = {
  /** Which course's lessons/xp/level the rest of this store reflects. */
  course: Course;
  /** Sets the active course, and remembers it for the signed-in account (see adoptUser). */
  setCourse: (course: Course) => void;
  /** The signed-in account this store belongs to; null when signed out. */
  userId: string | null;
  /**
   * Called once a session is known: takes that account's remembered course (else `fallback`, the course in its
   * learner profile; English when neither) and returns it, so the
   * caller fetches the right course's progress. The same account again keeps the course already in memory.
   */
  adoptUser: (userId: string, fallback?: Course | null) => Course;
  /** The course the last hydrate() was for; null before any. A mismatch with `course` means the numbers are stale. */
  hydratedCourse: Course | null;
  xp: number;
  streak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  /** user_progress.day_basis ("utc" or "local"): what the shown streak needs for the one-time UTC bridge. */
  dayBasis: string | null;
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
  /** Applies the refill rule to the current clock: every heart that has come due is added. */
  refillHeartsLocal: () => void;
  /** Takes the server's answer (restore_hearts_if_due) as the truth for hearts and the timer. */
  setHeartsLocal: (hearts: number, heartsRefillAt: number | null) => void;
  gainHeartsLocal: (amount: number) => void;
  spendXpForHeartLocal: (cost: number) => void;
  reset: () => void;
};

const initial = {
  xp: 0,
  streak: 0,
  longestStreak: 0,
  lastActiveDate: null as string | null,
  dayBasis: null as string | null,
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

export const useProgress = create<ProgressState>()((set, get) => ({
  ...initial,
  course: "en",
  setCourse: (course) => {
    const { userId } = get();
    if (userId) rememberCourse(userId, course);
    set({ course });
  },
  userId: null,
  adoptUser: (userId, fallback) => {
    const s = get();
    if (s.userId === userId) return s.course;
    // This browser's memory first; on a new device, the course the account chose (its learner profile); English last.
    const course = rememberedCourse(userId) ?? fallback ?? "en";
    set({ userId, course });
    return course;
  },
  hydratedCourse: null,
  hydrated: false,
  loading: false,
  setLoading: (v) => set({ loading: v }),
  setCefrLevelLocal: (level) => set({ cefrLevel: level }),
  setPlacementLocal: (p) => set({ ...p }),
  hydrate: (input) =>
    set((s) => ({
      ...initial,
      ...input,
      hydratedCourse: s.course,
      hydrated: true,
      loading: false,
    })),
  // Every completion writes day_basis "local" on the server (20261114100000_local_days.sql).
  applyCompletion: (patch) => set((s) => ({ ...s, ...patch, dayBasis: "local" })),
  loseHeartLocal: () => set((s) => loseHeart(s.hearts, s.heartsRefillAt, Date.now())),
  refillHeartsLocal: () => set((s) => resolveHeartsRefill(s.hearts, s.heartsRefillAt, Date.now())),
  setHeartsLocal: (hearts, heartsRefillAt) => set({ hearts, heartsRefillAt }),
  gainHeartsLocal: (amount) =>
    set((s) => gainHearts(s.hearts, amount, s.heartsRefillAt, Date.now())),
  spendXpForHeartLocal: (cost) =>
    set((s) => ({
      ...gainHearts(s.hearts, 1, s.heartsRefillAt, Date.now()),
      xp: Math.max(0, s.xp - cost),
    })),
  // `course` is deliberately not part of `initial` -- hydrate() spreads
  // `...initial` too, and must NOT reset course there (switchCourse calls
  // setCourse() immediately before hydrate() with the just-fetched
  // snapshot). reset() has no such constraint, so it restores course here
  // explicitly instead.
  reset: () =>
    set({ ...initial, course: "en", userId: null, hydratedCourse: null, hydrated: true }),
}));
