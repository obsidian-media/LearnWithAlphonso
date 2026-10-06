import type { Level } from "../data/levels";

/**
 * The learning-goal plan, computed ONCE here and rendered by web, iOS and Android
 * (docs/superpowers/specs/2026-10-05-learning-goal-planner-design.md). Clients never
 * redo this maths: a fix lands everywhere at once.
 */
export const LEVEL_ORDER: Level[] = ["A1", "A2", "B1", "B2", "C1"];
/** Product-tuning warning limits, in lessons per week (about 2 a day, then about 5). */
export const AMBITIOUS_PER_WEEK = 14;
export const UNREALISTIC_PER_WEEK = 35;
export const RECENT_DAYS = 7;
export const MAX_GOAL_DAYS = 1095;
const DAY_MS = 86_400_000;
const AHEAD_FACTOR = 1.25;

export type GoalStatus = "done" | "expired" | "just_started" | "ahead" | "on_track" | "behind";
export type GoalRealism = "ok" | "ambitious" | "unrealistic";
export type GoalCourse = "en" | "fr" | "es";
export type GoalInput = { course: GoalCourse; targetLevel: Level; targetDate: string };

export type GoalPlan = {
  currentLevel: Level;
  targetLevel: Level;
  targetDate: string;
  lessonsInScope: number;
  lessonsRemaining: number;
  lessonsDoneLast7Days: number;
  requiredPerWeek: number;
  status: GoalStatus;
  realism: GoalRealism;
  suggestedDate: string | null;
  asOf: string;
};

export type PlanInput = {
  currentLevel: Level;
  targetLevel: Level;
  targetDate: string;
  lessonsByLevel: Record<Level, string[]>;
  /** lesson id -> ISO completed_at (the FIRST completion; replays do not change it). */
  completedAt: Record<string, string>;
  /** null for a preview (nothing saved yet). */
  goalCreatedAt: string | null;
  now: Date;
};

const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const addDays = (date: string, days: number) =>
  new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);

export function isRealDate(s: string): boolean {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return false;
  const parsed = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === s;
}

export function planGoal(input: PlanInput): GoalPlan | null {
  const from = LEVEL_ORDER.indexOf(input.currentLevel);
  const to = LEVEL_ORDER.indexOf(input.targetLevel);
  if (from < 0 || to < 0 || to < from) return null;

  const inScope = LEVEL_ORDER.slice(from, to + 1).flatMap((l) => input.lessonsByLevel[l] ?? []);
  const remaining = inScope.filter((id) => !(id in input.completedAt)).length;

  const today = input.now.toISOString().slice(0, 10);
  const daysLeft = Math.max(0, dayNumber(input.targetDate) - dayNumber(today));
  // A goal whose date is today or earlier cannot be "N lessons a week"; it is expired and
  // the learner is invited to pick a new date (a weekly number there would be nonsense).
  const expired = remaining > 0 && daysLeft === 0;
  const required = remaining === 0 || expired ? 0 : Math.ceil(remaining / (daysLeft / 7));

  // Progress toward THIS goal: first completions in the last 7 days of lessons that are in
  // scope. A lesson below the learner's current level does not move the goal.
  const cutoff = input.now.getTime() - RECENT_DAYS * DAY_MS;
  const recent = inScope.filter(
    (id) => id in input.completedAt && Date.parse(input.completedAt[id]) >= cutoff,
  ).length;

  const goalAgeMs =
    input.goalCreatedAt === null ? 0 : input.now.getTime() - Date.parse(input.goalCreatedAt);
  let status: GoalStatus;
  if (remaining === 0) status = "done";
  else if (expired) status = "expired";
  else if (goalAgeMs < RECENT_DAYS * DAY_MS)
    status = "just_started"; // a preview has age 0
  else if (recent >= required * AHEAD_FACTOR) status = "ahead";
  else if (recent >= required) status = "on_track";
  else status = "behind";

  const realism: GoalRealism =
    required > UNREALISTIC_PER_WEEK
      ? "unrealistic"
      : required > AMBITIOUS_PER_WEEK
        ? "ambitious"
        : "ok";

  const suggestedDate =
    (status === "behind" || status === "expired" || realism === "unrealistic") && recent > 0
      ? addDays(today, Math.ceil((remaining / recent) * 7))
      : null;

  return {
    currentLevel: input.currentLevel,
    targetLevel: input.targetLevel,
    targetDate: input.targetDate,
    lessonsInScope: inScope.length,
    lessonsRemaining: remaining,
    lessonsDoneLast7Days: recent,
    requiredPerWeek: required,
    status,
    realism,
    suggestedDate,
    asOf: input.now.toISOString(),
  };
}

const COURSES = new Set<string>(["en", "fr", "es"]);

export function validateGoalInput(
  raw: unknown,
  ctx: { now: Date; currentLevel: Level },
): { ok: true; value: GoalInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid request" };
  const { course, targetLevel, targetDate } = raw as Record<string, unknown>;
  if (typeof course !== "string" || !COURSES.has(course)) {
    return { ok: false, error: "Unknown course" };
  }
  if (typeof targetLevel !== "string" || !LEVEL_ORDER.includes(targetLevel as Level)) {
    return { ok: false, error: "Unknown level" };
  }
  if (LEVEL_ORDER.indexOf(targetLevel as Level) < LEVEL_ORDER.indexOf(ctx.currentLevel)) {
    return { ok: false, error: "That level is below yours" };
  }
  if (typeof targetDate !== "string" || !isRealDate(targetDate)) {
    return { ok: false, error: "That is not a valid date" };
  }
  const today = ctx.now.toISOString().slice(0, 10);
  const days = dayNumber(targetDate) - dayNumber(today);
  if (days < 1) return { ok: false, error: "Pick a date after today" };
  if (days > MAX_GOAL_DAYS) return { ok: false, error: "Pick a date within three years" };
  return {
    ok: true,
    value: { course: course as GoalCourse, targetLevel: targetLevel as Level, targetDate },
  };
}
