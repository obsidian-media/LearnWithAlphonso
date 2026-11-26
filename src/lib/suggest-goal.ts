import type { Level } from "../data/levels";
import { SUGGESTED_GOAL_DAYS, SUGGESTED_GOAL_STEP_DAYS } from "../data/path-config";
import { LEVEL_ORDER, MAX_GOAL_DAYS, planGoal } from "./learning-goal";

const DAY_MS = 86_400_000;
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * Kept apart from learning-goal.ts on purpose: that file is imported by plain Node scripts (the e2e run), and
 * path-config.ts reads a JSON file, which Node only loads with an import attribute.
 */
// ---------------------------------------------------------------- the suggested goal (path v2)

export type SuggestGoalInput = {
  currentLevel: Level;
  now: Date;
  lessonsByLevel: Record<Level, string[]>;
  completedAt: Record<string, string>;
  dailyMinutes: number;
  /** Days a week the learner studies (the path's six, or seven with no rest day). */
  studyDays: number;
  /** Minutes one lesson takes, the average of the next few. */
  lessonMinutes: number;
};

/**
 * The goal a learner with no saved one is shown: the next CEFR level (the same level at C1: keep it) about
 * SUGGESTED_GOAL_DAYS days away, moved out a week at a time until the planner calls it "ok" (not ambitious, not
 * unrealistic: the realism rule above) and the lessons a week fit the learner's minutes. Never saved by this function.
 */
export function suggestGoal(input: SuggestGoalInput): { targetLevel: Level; targetDate: string } {
  const at = LEVEL_ORDER.indexOf(input.currentLevel);
  const targetLevel = LEVEL_ORDER[Math.min(Math.max(at, 0) + 1, LEVEL_ORDER.length - 1)];
  const today = input.now.toISOString().slice(0, 10);
  const capacity = Math.max(
    1,
    Math.floor((input.dailyMinutes * input.studyDays) / Math.max(1, input.lessonMinutes)),
  );
  let days = SUGGESTED_GOAL_DAYS;
  for (;;) {
    const targetDate = addDays(today, days);
    const plan = planGoal({
      currentLevel: input.currentLevel,
      targetLevel,
      targetDate,
      lessonsByLevel: input.lessonsByLevel,
      completedAt: input.completedAt,
      goalCreatedAt: null,
      now: input.now,
    });
    // At the three-year limit the date is as far as a goal may go: stop there rather than loop.
    if (!plan || days >= MAX_GOAL_DAYS) return { targetLevel, targetDate };
    if (plan.realism === "ok" && plan.requiredPerWeek <= capacity) {
      return { targetLevel, targetDate };
    }
    days = Math.min(MAX_GOAL_DAYS, days + SUGGESTED_GOAL_STEP_DAYS);
  }
}
