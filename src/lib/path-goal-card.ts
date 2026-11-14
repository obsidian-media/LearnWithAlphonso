import type { LearningPath } from "./path-plan";

/**
 * The goal card at the top of MY PATH: what the learner is aiming for, in the planner's own numbers. It does no plan
 * maths: the level, the date, the lessons a week and the status words all come from /api/learning-path, which got them
 * from `planGoal`. iOS (`PathGoalCard` in the Kit) and Android (`PathGoalCard.kt`) print the same text, pinned by the
 * same learners in learning-path.fixtures.json; change all three together.
 */
export type PathGoalCardLines = {
  /** True when a goal is set; the card then opens the planner to change it, otherwise to set one. */
  hasGoal: boolean;
  kicker: string;
  headline: string;
  detail: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-10" -> "10 Nov 2026", a fixed English table (not the browser locale); anything else comes back unchanged. */
export function formatGoalDate(iso: string): string {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(iso);
  if (!match) return iso;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (month < 1 || month > 12 || date.getUTCDate() !== day) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export const GOAL_CARD_KICKER = "My goal";
export const GOAL_CARD_UNSET_HEADLINE = "Set a goal";
export const GOAL_CARD_UNSET_DETAIL = "Pick a level and a date and we work out the lessons a week.";

/** The card for a path, or the invitation when there is none yet (no goal set). */
export function pathGoalCard(path: LearningPath | null): PathGoalCardLines {
  if (!path) {
    return {
      hasGoal: false,
      kicker: GOAL_CARD_KICKER,
      headline: GOAL_CARD_UNSET_HEADLINE,
      detail: GOAL_CARD_UNSET_DETAIL,
    };
  }
  const { targetLevel, targetDate, requiredPerWeek } = path.progress;
  // The server reports 0 a week once the goal is reached or its date has passed: a number would mean nothing.
  const perWeek =
    requiredPerWeek > 0
      ? `${requiredPerWeek} ${requiredPerWeek === 1 ? "lesson" : "lessons"} a week`
      : null;
  return {
    hasGoal: true,
    kicker: GOAL_CARD_KICKER,
    headline: `${targetLevel} by ${formatGoalDate(targetDate)}`,
    detail: perWeek ? `${perWeek} · ${path.statusLine}` : path.statusLine,
  };
}

/** The first-run purposes, in the words first run used for them (the iPhone's FirstRun.goalChoices). */
const PURPOSE_LABELS: Record<string, string> = {
  travel: "Travel",
  work: "Work",
  school: "School",
  family: "Family",
  exam: "An exam",
  fun: "Just for fun",
};

export const PATH_GOAL_CHIPS_NOTE = "Pre-filled from first run and your level. Tap to change.";

/** "Travel", "Finish B1", "by 10 May 2027": the purpose only when it is a known one, never an invented one. */
export function pathGoalChips(
  purposeId: string | null | undefined,
  targetLevel: string,
  targetDate: string,
): string[] {
  const out: string[] = [];
  const purpose = purposeId ? PURPOSE_LABELS[purposeId] : undefined;
  if (purpose) out.push(purpose);
  out.push(`Finish ${targetLevel}`, `by ${formatGoalDate(targetDate)}`);
  return out;
}
