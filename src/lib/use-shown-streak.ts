import { useProgress } from "@/lib/progress";
import { browserToday, shownStreak, type ShownStreak } from "@/lib/streak-display";

/** The signed-in learner's streak as it reads today (shownStreak): the same number and state on every screen. */
export function useShownStreak(): ShownStreak {
  const streak = useProgress((s) => s.streak);
  const lastActiveDate = useProgress((s) => s.lastActiveDate);
  const streakFreezes = useProgress((s) => s.streakFreezes);
  const dayBasis = useProgress((s) => s.dayBasis);
  return shownStreak({ streak, lastActiveDate, streakFreezes, dayBasis }, browserToday());
}
