import { describe, expect, it } from "vitest";
import type { Unit } from "../data/curriculum";
import { planFor, startLevelFor } from "./first-run-plan";

const q = { type: "mc", prompt: "p", choices: ["a", "b"], answer: 0, explanation: "" } as never;
function unit(id: string, level: Unit["level"], lessons: number, perLesson = 6): Unit {
  return {
    id,
    level,
    eyebrow: "",
    title: `Unit ${id}`,
    description: "",
    lessons: Array.from({ length: lessons }, (_, i) => ({
      id: `${id}-${i}`,
      title: "",
      subtitle: "",
      questions: Array.from({ length: perLesson }, () => q),
    })),
  };
}

describe("the personal plan", () => {
  it("starts where the learner said: brand new at A1, some at A2, confident at B1", () => {
    expect(startLevelFor("new")).toBe("A1");
    expect(startLevelFor("some")).toBe("A2");
    expect(startLevelFor("confident")).toBe("B1");
    expect(startLevelFor(undefined)).toBe("A1");
  });

  it("draws the first three units of that level, with their rooms", () => {
    const units = [
      unit("a", "A1", 2),
      unit("b", "A2", 2),
      unit("c", "A2", 2),
      unit("d", "A2", 2),
      unit("e", "A2", 2),
    ];
    const plan = planFor({
      units,
      level: "some",
      dailyMinutes: 10,
      now: new Date("2026-11-06T12:00:00Z"),
    });
    expect(plan.nodes.map((n) => n.title)).toEqual(["Unit b", "Unit c", "Unit d"]);
    expect(plan.nodes[0].room).toMatch(/^\/avatar\/scenes\/.+\.webp$/);
  });

  it("dates the second unit from the real lesson lengths and the daily minutes", () => {
    const units = [unit("a", "A1", 3), unit("b", "A1", 3), unit("c", "A1", 3)];
    const now = new Date("2026-11-06T12:00:00Z");
    const slow = planFor({ units, level: "new", dailyMinutes: 5, now });
    const fast = planFor({ units, level: "new", dailyMinutes: 20, now });
    expect(slow.goalUnitTitle).toBe("Unit b");
    // More minutes a day, an earlier (or equal) date; never a date in the past.
    expect(Date.parse(fast.goalDate)).toBeLessThanOrEqual(Date.parse(slow.goalDate));
    expect(Date.parse(fast.goalDate)).toBeGreaterThan(now.getTime());
  });
});
