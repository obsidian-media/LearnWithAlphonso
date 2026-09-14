import type { LeagueTier } from "../data/achievements";

/** Pure XP/streak/league math extracted from sync.functions.ts, so it can
 * be unit tested without a database. Keep the DB-touching handler as the
 * only place that reads/writes rows -- this module just computes values. */

export function computeXpGain(correct: number, total: number): number {
  return correct * 10 + (correct === total ? 20 : 0);
}

function daysDiff(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export type StreakInput = {
  lastActiveDate: string | null;
  today: string;
  streak: number;
  longestStreak: number;
  freezes: number;
};

export type StreakResult = {
  streak: number;
  longestStreak: number;
  freezes: number;
};

/**
 * Same-day: no change. First-ever activity: streak starts at 1. A
 * one-day gap continues the streak; a two-day gap continues it only by
 * spending a streak freeze; anything wider resets to 1. Every 10th streak
 * day earns back one freeze.
 */
export function computeStreakUpdate(input: StreakInput): StreakResult {
  const { lastActiveDate, today, longestStreak } = input;
  let streak = input.streak;
  let freezes = input.freezes;

  if (lastActiveDate === today) {
    // same day, no change
  } else if (!lastActiveDate) {
    streak = 1;
  } else {
    const diff = daysDiff(lastActiveDate, today);
    if (diff === 1) streak = input.streak + 1;
    else if (diff === 2 && freezes > 0) {
      streak = input.streak + 1;
      freezes -= 1;
    } else streak = 1;
  }

  if (streak > input.streak && streak % 10 === 0) freezes += 1;

  return { streak, longestStreak: Math.max(longestStreak, streak), freezes };
}

export const LEAGUES: LeagueTier[] = ["bronze", "silver", "sapphire", "ruby", "diamond"];
export const LEAGUE_THRESHOLDS = [0, 300, 1000, 3000, 8000];

/** A league is never demoted -- newIdx is always >= oldIdx. */
export function computeLeaguePromotion(
  xp: number,
  oldIdx: number,
): { leagueTier: LeagueTier; newIdx: number } {
  let newIdx = oldIdx;
  for (let i = LEAGUES.length - 1; i >= 0; i--) {
    if (xp >= LEAGUE_THRESHOLDS[i]) {
      newIdx = Math.max(oldIdx, i);
      break;
    }
  }
  return { leagueTier: LEAGUES[newIdx], newIdx };
}
