/** Pure hearts-economy math, extracted so it's unit testable without a
 * database -- same pattern as progress-math.ts. The DB-touching handlers
 * in sync.functions.ts / review.functions.ts are the only place that
 * read/write rows; this module just computes values. */

export const MAX_HEARTS = 5;
export const HEART_REFILL_MS = 30 * 60 * 1000;
export const STREAK_HEART_MILESTONE_DAYS = 7;
export const XP_HEART_COST = 50;

export type HeartsState = { hearts: number; heartsRefillAt: number | null };

/**
 * Once `heartsRefillAt` has passed, hearts are back to full and the timer
 * clears. Before that, nothing changes. This is the resolution step that
 * was previously missing everywhere -- the timer was set but nothing ever
 * consumed it.
 */
export function resolveHeartsRefill(
  hearts: number,
  heartsRefillAt: number | null,
  now: number,
): HeartsState {
  if (heartsRefillAt !== null && now >= heartsRefillAt) {
    return { hearts: MAX_HEARTS, heartsRefillAt: null };
  }
  return { hearts, heartsRefillAt };
}

/** Adds hearts (from a bonus), capped at MAX_HEARTS. Any gain means the
 * user is no longer blocked, so the refill timer clears too. */
export function gainHearts(hearts: number, amount: number): HeartsState {
  return { hearts: Math.min(MAX_HEARTS, hearts + amount), heartsRefillAt: null };
}

/** A lesson with zero wrong answers earns a heart back. */
export function perfectLessonBonusEarned(correct: number, total: number): boolean {
  return total > 0 && correct === total;
}

/** Every STREAK_HEART_MILESTONE_DAYS-th streak day (7, 14, 21, ...) earns
 * a full refill -- only on the day the streak actually advances into it. */
export function streakHeartMilestoneReached(oldStreak: number, newStreak: number): boolean {
  return newStreak > oldStreak && newStreak % STREAK_HEART_MILESTONE_DAYS === 0;
}

export type XpPurchaseResult =
  | { ok: true; hearts: number; xp: number }
  | { ok: false; reason: "hearts-full" | "insufficient-xp" };

/** Spend XP to buy back a heart -- an XP sink that gives impatient users
 * agency instead of just waiting out the timer. */
export function buyHeartWithXp(hearts: number, xp: number, cost = XP_HEART_COST): XpPurchaseResult {
  if (hearts >= MAX_HEARTS) return { ok: false, reason: "hearts-full" };
  if (xp < cost) return { ok: false, reason: "insufficient-xp" };
  return { ok: true, hearts: hearts + 1, xp: xp - cost };
}
