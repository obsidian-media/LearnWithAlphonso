/**
 * Profile data (migration 20261107120000_profile_data.sql): the pure rules behind learning minutes and the skills
 * chart. The Edge Function keeps a hand-mirrored copy (supabase/functions/_shared/profile-data.ts); a test holds
 * the two in step.
 */

export const SKILLS = ["listening", "speaking", "vocabulary", "grammar", "reading"] as const;
export type Skill = (typeof SKILLS)[number];

/**
 * The one table that says which skill a question type trains (owner may re-label; the stored rows carry the skill,
 * so a change here applies from then on).
 *   listening -> listening;  speak (and Practice calls) -> speaking;  mc -> vocabulary (a word or meaning choice);
 *   fill and reorder -> grammar (the right form, the right order);  translate -> reading (understanding a sentence).
 */
const SKILL_OF_TYPE: Record<string, Skill> = {
  listening: "listening",
  speak: "speaking",
  mc: "vocabulary",
  fill: "grammar",
  reorder: "grammar",
  translate: "reading",
};
export const skillOfQuestionType = (type: string): Skill | null => SKILL_OF_TYPE[type] ?? null;

export type SkillResult = { skill: Skill; right: number; total: number };

/** The graded answers of one lesson, folded into one entry per skill (an unknown question type counts for none). */
export function skillResults(graded: { type: string; correct: boolean }[]): SkillResult[] {
  const by = new Map<Skill, SkillResult>();
  for (const g of graded) {
    const skill = skillOfQuestionType(g.type);
    if (!skill) continue;
    const r = by.get(skill) ?? { skill, right: 0, total: 0 };
    r.total += 1;
    if (g.correct) r.right += 1;
    by.set(skill, r);
  }
  return SKILLS.flatMap((s) => by.get(s) ?? []);
}

/** The most learning time one lesson or one practice call is credited (add_learning_seconds refuses over 3600). */
export const MAX_ACTIVITY_SECONDS = 900;

/** Seconds from the lesson session's start to now, within [0, MAX_ACTIVITY_SECONDS]; 0 when the start is unknown. */
export function lessonSeconds(sessionIssuedAtMs: number | null, nowMs: number): number {
  if (sessionIssuedAtMs === null || !Number.isFinite(sessionIssuedAtMs)) return 0;
  return Math.min(
    MAX_ACTIVITY_SECONDS,
    Math.max(0, Math.round((nowMs - sessionIssuedAtMs) / 1000)),
  );
}

/** A practice call's length from the server's own first and last reply times, within [0, MAX_ACTIVITY_SECONDS]. */
export function practiceSeconds(startedAt: string, lastReplyAt: string): number {
  const ms = Date.parse(lastReplyAt) - Date.parse(startedAt);
  return Number.isFinite(ms)
    ? Math.min(MAX_ACTIVITY_SECONDS, Math.max(0, Math.round(ms / 1000)))
    : 0;
}

export type SkillDayRow = { day: string; skill: string; right: number; total: number };
export type SkillScore = { skill: Skill; answered: number; pct: number | null };

/** The recent window the skills chart reads. */
export const SKILL_WINDOW_DAYS = 28;

/**
 * One score per skill, always all five in SKILLS order: the right share of the answers in [today - window + 1, today]
 * as a rounded percent, or null when nothing was answered (so a skill never trained shows as empty, not as 0%).
 */
export function skillScores(
  rows: SkillDayRow[],
  today: string,
  windowDays: number = SKILL_WINDOW_DAYS,
): SkillScore[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  const from = new Date(end - (windowDays - 1) * 86_400_000).toISOString().slice(0, 10);
  return SKILLS.map((skill) => {
    const mine = rows.filter((r) => r.skill === skill && r.day >= from && r.day <= today);
    const total = mine.reduce((s, r) => s + r.total, 0);
    const right = mine.reduce((s, r) => s + r.right, 0);
    return { skill, answered: total, pct: total > 0 ? Math.round((100 * right) / total) : null };
  });
}

export type LearningDayRow = { day: string; lessonSeconds: number; practiceSeconds: number };

/** Whole minutes learned (lesson + practice) on one day. */
export function learningMinutesOn(rows: LearningDayRow[], day: string): number {
  const r = rows.find((x) => x.day === day);
  return r ? Math.floor((r.lessonSeconds + r.practiceSeconds) / 60) : 0;
}

/** The learner's daily minutes goal (5/10/15/20, learner_profile) against one day: minutes, and done when reached. */
export function dailyGoalProgress(
  rows: LearningDayRow[],
  day: string,
  goalMinutes: number,
): { minutes: number; goalMinutes: number; reached: boolean } {
  // Speech seconds (speech_days) are time already inside lesson and practice seconds: never added again.
  const minutes = learningMinutesOn(rows, day);
  return { minutes, goalMinutes, reached: goalMinutes > 0 && minutes >= goalMinutes };
}

/** An IANA zone name the runtime knows: what the device or browser reports (Intl.DateTimeFormat().resolvedOptions()). */
export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || zone.length === 0 || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export type LeagueStanding = {
  leagueTier: string;
  rank: number;
  size: number;
  /** Monday of the league week and its Sunday (UTC dates). */
  weekStart: string;
  weekEnd: string;
  weekXp: number;
};
