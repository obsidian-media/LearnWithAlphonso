import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Level } from "../data/levels";
import {
  AMBITIOUS_PER_WEEK,
  LEVEL_ORDER,
  UNREALISTIC_PER_WEEK,
  isRealDate,
  planGoal,
  validateGoalInput,
  type PlanInput,
} from "./learning-goal";

const NOW = new Date("2026-10-06T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

function lessons(per = 10): Record<Level, string[]> {
  const out = {} as Record<Level, string[]>;
  for (const l of LEVEL_ORDER) out[l] = Array.from({ length: per }, (_, i) => `${l}-${i}`);
  return out;
}
/** Completed ids with the given age in days, e.g. done(["A1-0","A1-1"], 2). */
function done(ids: string[], ageDays: number): Record<string, string> {
  return Object.fromEntries(ids.map((id) => [id, daysAgo(ageDays)]));
}
const ids = (level: Level, n: number) => Array.from({ length: n }, (_, i) => `${level}-${i}`);
const everyLessonThrough = (last: Level) =>
  LEVEL_ORDER.slice(0, LEVEL_ORDER.indexOf(last) + 1).flatMap((l) => ids(l, 10));

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    currentLevel: "A1",
    targetLevel: "B1",
    targetDate: "2026-10-20", // 14 days = 2 weeks away
    lessonsByLevel: lessons(),
    completedAt: {},
    goalCreatedAt: daysAgo(30),
    now: NOW,
    ...over,
  };
}

describe("planGoal scope", () => {
  it("counts from the current level, not from A1", () => {
    const plan = planGoal(input({ currentLevel: "B1", targetLevel: "B1" }))!;
    expect(plan.lessonsInScope).toBe(10);
    expect(plan.lessonsRemaining).toBe(10);
  });
  it("spans every level between current and target, inclusive", () => {
    expect(planGoal(input())!.lessonsInScope).toBe(30);
  });
  it("excludes completed lessons from remaining, and ignores completions outside scope", () => {
    const completedAt = { ...done(ids("A1", 4), 20), ...done(ids("C1", 5), 20) };
    expect(planGoal(input({ completedAt }))!.lessonsRemaining).toBe(26);
  });
  it("returns null when the target is below the current level", () => {
    expect(planGoal(input({ currentLevel: "B2", targetLevel: "B1" }))).toBeNull();
  });
});

describe("planGoal pace", () => {
  it("rounds the weekly requirement UP", () => {
    expect(planGoal(input())!.requiredPerWeek).toBe(15); // 30 over 2 weeks
    expect(planGoal(input({ completedAt: done(["A1-0"], 20) }))!.requiredPerWeek).toBe(15); // 29/2 = 14.5
    expect(planGoal(input({ completedAt: done(ids("A1", 2), 20) }))!.requiredPerWeek).toBe(14); // 28/2
  });
  it("a goal one day out needs the whole remainder in one day", () => {
    const base = { currentLevel: "B1", targetLevel: "B1" } as const;
    expect(planGoal(input({ ...base, targetDate: "2026-10-07" }))!.requiredPerWeek).toBe(70);
  });
  it("an expired goal (date today or earlier) is status expired with no weekly number", () => {
    const base = { currentLevel: "B1", targetLevel: "B1" } as const;
    for (const targetDate of ["2026-10-06", "2026-09-01"]) {
      const plan = planGoal(input({ ...base, targetDate }))!;
      expect(plan.status, targetDate).toBe("expired");
      expect(plan.requiredPerWeek).toBe(0);
      expect(plan.realism).toBe("ok");
      expect(plan.suggestedDate).toBeNull(); // no recent lessons, so nothing to extrapolate
    }
    const paced = planGoal(
      input({ ...base, targetDate: "2026-09-01", completedAt: done(ids("B1", 2), 1) }),
    )!;
    expect(paced.status).toBe("expired");
    expect(paced.suggestedDate).toBe("2026-11-03"); // 8 left at 2 a week = 28 days from today
  });
  it("a finished goal is done even when its date has passed", () => {
    const base = { currentLevel: "B1", targetLevel: "B1" } as const;
    const plan = planGoal(
      input({ ...base, targetDate: "2026-09-01", completedAt: done(ids("B1", 10), 30) }),
    )!;
    expect(plan.status).toBe("done");
  });
  it("counts only lessons completed in the last 7 days", () => {
    const completedAt = { ...done(["A1-0"], 6.9), ...done(["A1-1"], 7.1) };
    expect(planGoal(input({ completedAt }))!.lessonsDoneLast7Days).toBe(1);
  });
  it("a completion exactly 7 days old still counts", () => {
    const completedAt = done(["A1-0"], 7);
    expect(planGoal(input({ completedAt }))!.lessonsDoneLast7Days).toBe(1);
  });
  it("ignores recent completions outside the goal's scope (they do not move the goal)", () => {
    const completedAt = done(["A1-0", "C1-0"], 1);
    const plan = planGoal(input({ currentLevel: "B1", targetLevel: "B1", completedAt }))!;
    expect(plan.lessonsDoneLast7Days).toBe(0);
    expect(plan.status).toBe("behind");
  });
});

describe("planGoal status", () => {
  it("done when nothing remains", () => {
    const plan = planGoal(input({ completedAt: done(everyLessonThrough("B1"), 1) }))!;
    expect(plan.status).toBe("done");
    expect(plan.requiredPerWeek).toBe(0);
  });
  it("just_started for a goal under 7 days old, and for a preview", () => {
    expect(planGoal(input({ goalCreatedAt: daysAgo(2) }))!.status).toBe("just_started");
    expect(planGoal(input({ goalCreatedAt: null }))!.status).toBe("just_started");
  });
  it("behind with no recent lessons", () => {
    expect(planGoal(input())!.status).toBe("behind");
  });
  it("behind, on_track and ahead against the requirement", () => {
    // 5 done: remaining 25, required 13, did 5 -> behind
    expect(planGoal(input({ completedAt: done(ids("A1", 5), 2) }))!.status).toBe("behind");
    // 10 done: remaining 20, required 10, did 10 -> on_track (below 1.25x)
    expect(planGoal(input({ completedAt: done(ids("A1", 10), 2) }))!.status).toBe("on_track");
    // 15 done: remaining 15, required 8, did 15 (>= 10) -> ahead
    const completedAt = { ...done(ids("A1", 10), 2), ...done(ids("A2", 5), 2) };
    expect(planGoal(input({ completedAt }))!.status).toBe("ahead");
  });
  it("ahead starts exactly at 1.25x the requirement", () => {
    // 4 old + 10 recent: remaining 16, required 8, and 10 = 1.25 x 8 exactly.
    const completedAt = {
      ...done(ids("A1", 4), 20),
      ...done([...ids("A1", 10).slice(4), ...ids("A2", 4)], 2),
    };
    const plan = planGoal(input({ completedAt }))!;
    expect([plan.requiredPerWeek, plan.lessonsDoneLast7Days]).toEqual([8, 10]);
    expect(plan.status).toBe("ahead");
  });
});

describe("planGoal realism and suggested date", () => {
  // Choose the lesson count so the requirement over the two weeks is exactly n a week.
  const perWeek = (n: number) =>
    planGoal(input({ lessonsByLevel: lessons(n * 2), currentLevel: "A1", targetLevel: "A1" }))!;
  it("labels by the named thresholds", () => {
    expect(perWeek(AMBITIOUS_PER_WEEK).realism).toBe("ok");
    expect(perWeek(AMBITIOUS_PER_WEEK + 1).realism).toBe("ambitious");
    expect(perWeek(UNREALISTIC_PER_WEEK).realism).toBe("ambitious");
    expect(perWeek(UNREALISTIC_PER_WEEK + 1).realism).toBe("unrealistic");
  });
  it("suggests a date from the recent pace when behind", () => {
    // 5 done in the last 7 days, 25 remaining -> ceil(25 / 5 * 7) = 35 days
    const plan = planGoal(input({ completedAt: done(ids("A1", 5), 2) }))!;
    expect(plan.suggestedDate).toBe("2026-11-10");
  });
  it("suggests nothing when the recent pace is zero, or when on track and realistic", () => {
    expect(planGoal(input())!.suggestedDate).toBeNull();
    expect(planGoal(input({ completedAt: done(ids("A1", 10), 2) }))!.suggestedDate).toBeNull();
  });
});

describe("isRealDate and validateGoalInput", () => {
  it("rejects impossible and malformed dates", () => {
    expect(isRealDate("2026-10-20")).toBe(true);
    for (const bad of ["2026-02-30", "2026-13-01", "26-10-20", "2026-10-2", "", "tomorrow"]) {
      expect(isRealDate(bad), bad).toBe(false);
    }
  });
  const ctx = { now: NOW, currentLevel: "A2" as Level };
  const ok = { course: "en", targetLevel: "B1", targetDate: "2026-12-01" };
  it("accepts a valid goal", () => {
    expect(validateGoalInput(ok, ctx)).toEqual({ ok: true, value: ok });
  });
  it.each([
    ["not an object", null],
    ["unknown course", { ...ok, course: "de" }],
    ["unknown level", { ...ok, targetLevel: "D1" }],
    ["level below current", { ...ok, targetLevel: "A1" }],
    ["date today", { ...ok, targetDate: "2026-10-06" }],
    ["date in the past", { ...ok, targetDate: "2026-09-01" }],
    ["impossible date", { ...ok, targetDate: "2026-02-30" }],
    ["more than three years out", { ...ok, targetDate: "2030-01-01" }],
    ["non-string date", { ...ok, targetDate: 20261201 }],
  ])("rejects %s", (_name, raw) => {
    expect(validateGoalInput(raw, ctx)).toMatchObject({ ok: false });
  });
  it("allows finishing the current level", () => {
    expect(validateGoalInput({ ...ok, targetLevel: "A2" }, ctx)).toMatchObject({ ok: true });
  });
});

// The response shape is the cross-platform contract: iOS and Android decode these samples.
// `plans` are bare plans; `envelopes` are the full route responses (goal + plan), including
// "a goal whose plan is null" and "no goal". Regenerate with:
//   UPDATE_FIXTURES=1 bun run test src/lib/learning-goal.test.ts   (then read the file)
describe("shared fixtures", () => {
  const FILE = path.resolve(import.meta.dirname, "learning-goal.fixtures.json");
  const cases: Record<string, PlanInput> = {
    done: input({ completedAt: done(everyLessonThrough("B1"), 1) }),
    just_started: input({ goalCreatedAt: daysAgo(2) }),
    behind_with_suggestion: input({ completedAt: done(ids("A1", 5), 2) }),
    on_track: input({ completedAt: done(ids("A1", 10), 2) }),
    ahead: input({ completedAt: { ...done(ids("A1", 10), 2), ...done(ids("A2", 5), 2) } }),
    unrealistic: input({ lessonsByLevel: lessons(80), currentLevel: "A1", targetLevel: "A1" }),
    expired: input({ targetDate: "2026-09-01", completedAt: done(ids("A1", 2), 1) }),
  };
  const plans = Object.fromEntries(Object.entries(cases).map(([k, v]) => [k, planGoal(v)]));
  const goal = {
    course: "en",
    targetLevel: "B1",
    targetDate: "2026-10-20",
    createdAt: "2026-09-06T12:00:00.000Z",
  };
  const envelopes = {
    stored: { goal, plan: plans.on_track },
    stored_plan_null: { goal, plan: null },
    none: { goal: null, plan: null },
    preview: { plan: plans.just_started },
  };
  const actual = { plans, envelopes };
  it("matches the checked-in samples", () => {
    if (process.env.UPDATE_FIXTURES) fs.writeFileSync(FILE, JSON.stringify(actual, null, 2) + "\n");
    expect(JSON.parse(fs.readFileSync(FILE, "utf8"))).toEqual(actual);
  });
  it("covers every status and both warning labels", () => {
    const all = Object.values(plans);
    for (const status of ["done", "just_started", "behind", "on_track", "ahead", "expired"]) {
      expect(
        all.some((p) => p?.status === status),
        status,
      ).toBe(true);
    }
    for (const realism of ["ambitious", "unrealistic"]) {
      expect(
        all.some((p) => p?.realism === realism),
        realism,
      ).toBe(true);
    }
  });
});
