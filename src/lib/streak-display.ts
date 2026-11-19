import { computeStreakUpdate } from "@/lib/progress-math";
import { localDay, streakBridge } from "@/lib/local-day";

/**
 * The streak as it should read right now (StreakDisplay in the iOS Kit and the Android core). The `streak` column is
 * only rewritten when the learner next studies, so after missed days it still holds the old run. The answer is what
 * the server would do with a lesson today, through the server's own step (`computeStreakUpdate`):
 * - it continues the run without a freeze: the streak as it is ("active");
 * - it continues the run only by spending a freeze (exactly one missed day): the streak, marked "protected";
 * - it would restart the run (no freeze for the missed day, or two or more missed days): 0 ("lapsed").
 * The one-time UTC bridge (day_basis "utc", or unread) continues a one-day gap without a freeze, so it reads "active".
 */
export type StreakState = "active" | "protected" | "lapsed";
export type ShownStreak = { streak: number; state: StreakState };

export type StreakFacts = {
  streak: number;
  lastActiveDate: string | null | undefined;
  streakFreezes: number | null | undefined;
  /** user_progress.day_basis; null or undefined when unread, which is the server's default, "utc". */
  dayBasis: string | null | undefined;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const gapDays = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** `today` is the learner's local day, "YYYY-MM-DD". */
export function shownStreak(f: StreakFacts, today: string): ShownStreak {
  const streak = Math.max(0, f.streak);
  const last = f.lastActiveDate;
  if (streak === 0 || !last) return { streak, state: "active" };
  const gap = gapDays(last, today);
  if (!Number.isFinite(gap)) return { streak: 0, state: "lapsed" };
  // Same day, or a skewed future day: nothing changes.
  if (gap <= 0) return { streak, state: "active" };
  const freezes = Math.max(0, f.streakFreezes ?? 0);
  const next = computeStreakUpdate({
    lastActiveDate: last,
    today,
    streak,
    longestStreak: streak,
    freezes,
    bridgeUtcDay: streakBridge(f.dayBasis),
  });
  if (next.streak !== streak + 1) return { streak: 0, state: "lapsed" };
  // A freeze was spent when the step left fewer than it started with, counting the one a tenth day earns.
  const earned = next.streak % 10 === 0 ? 1 : 0;
  return { streak, state: next.freezes < freezes + earned ? "protected" : "active" };
}

/** The learner's local day in this browser: the zone the app sends the server, so both count the same day. */
export function browserToday(now: number = Date.now()): string {
  let zone: string | undefined;
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    zone = undefined;
  }
  return localDay(now, zone);
}

/** The header pill's and the profile tile's screen-reader label, as on iOS and Android. */
export function streakAriaLabel(s: ShownStreak): string {
  if (s.state === "protected") return `${s.streak}-day streak, protected by a streak freeze`;
  return `Streak: ${s.streak} day${s.streak === 1 ? "" : "s"}`;
}

/** The profile's line while the streak is protected. */
export const STREAK_PROTECTED_CAPTION = "Protected by a streak freeze";
