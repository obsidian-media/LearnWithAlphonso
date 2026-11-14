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
 * The refill rule. While hearts are below MAX_HEARTS one heart comes back every HEART_REFILL_MS, counted from the
 * moment the learner first dropped below MAX_HEARTS (or from the last refill). `heartsRefillAt` is when the NEXT heart
 * arrives; it is null exactly when hearts are full. A due timer adds every heart that has come due (a learner away for
 * two hours gets four), capped at MAX_HEARTS, and the leftover time carries over into the next heart. A learner below
 * MAX_HEARTS with no timer (an old row) starts the clock now rather than staying stuck. Keep identical to
 * supabase/functions/_shared/hearts.ts and the SQL function public.hearts_refill_resolve.
 */
export function resolveHeartsRefill(
  hearts: number,
  heartsRefillAt: number | null,
  now: number,
): HeartsState {
  if (hearts >= MAX_HEARTS) return { hearts: MAX_HEARTS, heartsRefillAt: null };
  if (heartsRefillAt === null) return { hearts, heartsRefillAt: now + HEART_REFILL_MS };
  if (now < heartsRefillAt) return { hearts, heartsRefillAt };
  const due = 1 + Math.floor((now - heartsRefillAt) / HEART_REFILL_MS);
  const next = Math.min(MAX_HEARTS, hearts + due);
  return next >= MAX_HEARTS
    ? { hearts: MAX_HEARTS, heartsRefillAt: null }
    : { hearts: next, heartsRefillAt: heartsRefillAt + due * HEART_REFILL_MS };
}

/**
 * A wrong answer. Resolves any due refill first, then takes one heart. If a refill is already pending its clock is kept
 * (losing a heart does not reset the wait); from full hearts a new clock starts now.
 */
export function loseHeart(hearts: number, heartsRefillAt: number | null, now: number): HeartsState {
  const cur = resolveHeartsRefill(hearts, heartsRefillAt, now);
  return {
    hearts: Math.max(0, cur.hearts - 1),
    heartsRefillAt: cur.heartsRefillAt ?? now + HEART_REFILL_MS,
  };
}

/**
 * Adds hearts (a bonus or a purchase), capped at MAX_HEARTS. A refill already running keeps its clock; the timer clears
 * only once hearts are full.
 */
export function gainHearts(
  hearts: number,
  amount: number,
  heartsRefillAt: number | null,
  now: number,
): HeartsState {
  const cur = resolveHeartsRefill(hearts, heartsRefillAt, now);
  return resolveHeartsRefill(Math.min(MAX_HEARTS, cur.hearts + amount), cur.heartsRefillAt, now);
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

/**
 * A lesson may start only with at least one heart, after resolving a due refill.
 * The server functions call this; the UI's own `hearts <= 0` check is a fast path, not the rule.
 * Keep identical to supabase/functions/_shared/hearts.ts's heartsGate.
 */
export type HeartsGate = { blocked: false } | { blocked: true; refillAt: number | null };

export function heartsGate(hearts: number, heartsRefillAt: number | null, now: number): HeartsGate {
  const resolved = resolveHeartsRefill(hearts, heartsRefillAt, now);
  return resolved.hearts > 0
    ? { blocked: false }
    : { blocked: true, refillAt: resolved.heartsRefillAt };
}
