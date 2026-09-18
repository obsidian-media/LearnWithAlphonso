// Deno copy of src/lib/progress-math.ts's pure functions. Supabase Edge
// Functions bundle each function directory independently, so a relative
// import reaching outside supabase/functions/ is not reliably resolvable
// by the deploy pipeline (see the "Open question" section of
// docs/superpowers/specs/2026-09-17-complete-lesson-edge-function-design.md,
// which explicitly allows this local-copy fallback). This file must stay
// byte-for-byte equivalent to the source of truth -- if you change the
// math here, change it there too (and vice versa), and keep both test
// suites (progress-math.test.ts, ProgressMathTests.swift) green.

export type LeagueTier = "bronze" | "silver" | "sapphire" | "ruby" | "diamond";

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

export const LEAGUES: LeagueTier[] = [
  "bronze",
  "silver",
  "sapphire",
  "ruby",
  "diamond",
];
export const LEAGUE_THRESHOLDS = [0, 300, 1000, 3000, 8000];

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

/**
 * The trust-boundary check: `total` must match the lesson's real question
 * count, and every claimed-missed question id must actually belong to
 * this lesson. `correct` is derived, never trusted directly. Throws on
 * any mismatch -- the caller should turn that into a 400/403 response.
 */
export function deriveLessonCompletion(
  lesson: { questions: { id: string }[] },
  total: number,
  missedQuestionIds: string[],
): { correct: number } {
  if (total !== lesson.questions.length) {
    throw new Error("Invalid lesson completion payload");
  }
  const realQuestionIds = new Set(lesson.questions.map((q) => q.id));
  const missedSet = new Set(missedQuestionIds);
  if (
    missedSet.size > total ||
    [...missedSet].some((id) => !realQuestionIds.has(id))
  ) {
    throw new Error("Invalid lesson completion payload");
  }
  return { correct: total - missedSet.size };
}
