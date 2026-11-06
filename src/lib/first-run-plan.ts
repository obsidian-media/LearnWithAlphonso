import type { Level, Unit } from "../data/curriculum";
import type { DailyMinutes, SelfLevel } from "./learner-profile";
import { estimateLessonMinutes } from "./lesson-time";
import { roomSrcForUnit } from "./lesson-stage";

/** Where the plan starts until the placement test (offered for "some" and "confident") says otherwise. */
export function startLevelFor(level: SelfLevel | undefined): Level {
  if (level === "some") return "A2";
  if (level === "confident") return "B1";
  return "A1";
}

export type FirstRunPlan = {
  nodes: { title: string; room: string }[];
  /** The second unit: the plan's first goal. */
  goalUnitTitle: string;
  /** ISO date (yyyy-mm-dd) the second unit is done by at the chosen daily time. */
  goalDate: string;
};

/** The first three units at the starting level, and when the second is done at `dailyMinutes` a day. */
export function planFor({
  units,
  level,
  dailyMinutes,
  now,
}: {
  units: readonly Unit[];
  level: SelfLevel | undefined;
  dailyMinutes: DailyMinutes | undefined;
  now: Date;
}): FirstRunPlan {
  const start = startLevelFor(level);
  const atLevel = units.filter((u) => u.level === start);
  const first = (atLevel.length ? atLevel : units).slice(0, 3);
  const minutes = first
    .slice(0, 2)
    .flatMap((u) => u.lessons)
    .reduce((sum, l) => sum + estimateLessonMinutes(l.questions, 0), 0);
  const days = Math.max(1, Math.ceil(minutes / (dailyMinutes ?? 10)));
  const goal = new Date(now.getTime() + days * 86_400_000);
  return {
    nodes: first.map((u) => ({ title: u.title, room: roomSrcForUnit(u.id) })),
    goalUnitTitle: first[1]?.title ?? first[0]?.title ?? "",
    goalDate: goal.toISOString().slice(0, 10),
  };
}
