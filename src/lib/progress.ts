import { create } from "zustand";
import { persist } from "zustand/middleware";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type ProgressState = {
  xp: number;
  streak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  hearts: number;
  heartsRefillAt: number | null;
  completedLessons: string[];
  answersByLesson: Record<string, { correct: number; total: number }>;
  activityDates: string[]; // last 30 days of activity
  hydrated: boolean;
  _setHydrated: () => void;
  completeLesson: (lessonId: string, correct: number, total: number) => number;
  loseHeart: () => void;
  reset: () => void;
};

const initial = {
  xp: 0,
  streak: 0,
  longestStreak: 0,
  lastActiveDate: null as string | null,
  hearts: 5,
  heartsRefillAt: null as number | null,
  completedLessons: [] as string[],
  answersByLesson: {} as Record<string, { correct: number; total: number }>,
  activityDates: [] as string[],
};

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...initial,
      hydrated: false,
      _setHydrated: () => set({ hydrated: true }),
      completeLesson: (lessonId, correct, total) => {
        const s = get();
        const today = todayStr();
        let streak = s.streak;
        if (s.lastActiveDate === today) {
          // same day, no streak change
        } else if (s.lastActiveDate === yesterdayStr()) {
          streak = s.streak + 1;
        } else {
          streak = 1;
        }
        const xpGain = correct * 10 + (correct === total ? 20 : 0);
        const completed = s.completedLessons.includes(lessonId)
          ? s.completedLessons
          : [...s.completedLessons, lessonId];
        const activityDates = s.activityDates.includes(today)
          ? s.activityDates
          : [...s.activityDates, today].slice(-30);
        set({
          xp: s.xp + xpGain,
          streak,
          longestStreak: Math.max(s.longestStreak, streak),
          lastActiveDate: today,
          completedLessons: completed,
          answersByLesson: {
            ...s.answersByLesson,
            [lessonId]: { correct, total },
          },
          activityDates,
        });
        return xpGain;
      },
      loseHeart: () => {
        const s = get();
        const next = Math.max(0, s.hearts - 1);
        set({
          hearts: next,
          heartsRefillAt: next === 0 ? Date.now() + 30 * 60 * 1000 : s.heartsRefillAt,
        });
      },
      reset: () => set({ ...initial, hydrated: true }),
    }),
    {
      name: "lingua-progress-v1",
      onRehydrateStorage: () => (state) => {
        state?._setHydrated();
      },
    },
  ),
);