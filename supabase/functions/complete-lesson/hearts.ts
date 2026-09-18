// Deno copy of src/lib/hearts.ts's pure functions. Same reasoning as
// progress-math.ts in this directory: Supabase Edge Functions bundle each
// function directory independently, so a relative import outside
// supabase/functions/ isn't reliably resolvable. Keep this byte-for-byte
// equivalent to the source of truth -- if you change the math here,
// change it there too (and vice versa), and keep hearts.test.ts green.

export const MAX_HEARTS = 5;
export const HEART_REFILL_MS = 30 * 60 * 1000;
export const STREAK_HEART_MILESTONE_DAYS = 7;
export const XP_HEART_COST = 50;

export type HeartsState = { hearts: number; heartsRefillAt: number | null };

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

export function gainHearts(hearts: number, amount: number): HeartsState {
  return {
    hearts: Math.min(MAX_HEARTS, hearts + amount),
    heartsRefillAt: null,
  };
}

export function perfectLessonBonusEarned(
  correct: number,
  total: number,
): boolean {
  return total > 0 && correct === total;
}

export function streakHeartMilestoneReached(
  oldStreak: number,
  newStreak: number,
): boolean {
  return newStreak > oldStreak && newStreak % STREAK_HEART_MILESTONE_DAYS === 0;
}
