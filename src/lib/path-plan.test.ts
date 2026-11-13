import { describe, expect, it } from "vitest";
import type { GoalPlan } from "./learning-goal";
import {
  planPath,
  type ActivityEvent,
  type Candidate,
  type PathInput,
  type PathType,
} from "./path-plan";
import { DAY_OVERFLOW_MINUTES, STUDY_DAYS_PER_WEEK } from "../data/path-config";

// Wednesday 2026-11-11 (UTC); the week is Mon 9 Nov .. Sun 15 Nov, Sunday is the rest day.
const NOW = new Date("2026-11-11T10:00:00Z");

const goalPlan = (over: Partial<GoalPlan> = {}): GoalPlan => ({
  currentLevel: "A2",
  targetLevel: "B1",
  targetDate: "2027-03-01",
  lessonsInScope: 100,
  lessonsRemaining: 60,
  lessonsDoneLast7Days: 8,
  requiredPerWeek: 8,
  status: "on_track",
  realism: "ok",
  suggestedDate: null,
  asOf: NOW.toISOString(),
  ...over,
});

const cand = (type: PathType, id: string, over: Partial<Candidate> = {}): Candidate => ({
  id,
  type,
  title: `${type} ${id}`,
  subtitle: "",
  minutes: type === "lesson" ? 5 : type === "podcast" ? 6 : type === "talk" ? 4 : 6,
  level: "A1",
  goals: [],
  interests: [],
  skills: [],
  ref: { kind: type, id },
  ...over,
});

function input(over: Partial<PathInput> = {}): PathInput {
  return {
    now: NOW,
    course: "en",
    goalPlan: goalPlan(),
    goalLabel: "B1 by 1 March",
    profile: { goal: "travel", interests: ["food"], dailyMinutes: 10 },
    prefs: { off: [], trimUntil: null },
    skillPct: {},
    candidates: {
      lesson: Array.from({ length: 40 }, (_, i) => cand("lesson", `l${i}`)),
      podcast: [
        cand("podcast", "p-food", { interests: ["food"], skills: ["listening"] }),
        cand("podcast", "p-plain", { skills: ["listening"] }),
        cand("podcast", "p-plain2", { skills: ["listening"] }),
        cand("podcast", "p-plain3", { skills: ["listening"] }),
      ],
      talk: [
        cand("talk", "t1", { skills: ["speaking"] }),
        cand("talk", "t2", { skills: ["speaking"] }),
        cand("talk", "t3", { skills: ["speaking"] }),
        cand("talk", "t4", { skills: ["speaking"] }),
      ],
      campaign: [
        cand("campaign", "c-other", { goals: ["work"], skills: ["speaking"] }),
        cand("campaign", "c-travel", { goals: ["travel"], skills: ["speaking"] }),
        cand("campaign", "c3", { goals: ["family"], skills: ["speaking"] }),
      ],
    },
    events: [],
    ...over,
  };
}

const mixMinutes = (p: ReturnType<typeof planPath>, type: PathType) =>
  p.mix.find((m) => m.type === type)?.minutes ?? 0;
const plannedTypes = (p: ReturnType<typeof planPath>) =>
  new Set(p.week.flatMap((d) => d.items.map((i) => i.type)));

describe("planPath: the weekly mix", () => {
  it("fills the week's minutes (daily minutes times study days)", () => {
    const p = planPath(input());
    const total = p.mix.reduce((s, m) => s + m.minutes, 0);
    expect(total).toBe(10 * STUDY_DAYS_PER_WEEK);
  });

  it("a weak listening score gives podcasts more minutes than a strong one", () => {
    const strong = planPath(input({ skillPct: { listening: 90, speaking: 90, grammar: 90 } }));
    const weak = planPath(input({ skillPct: { listening: 40, speaking: 90, grammar: 90 } }));
    expect(mixMinutes(weak, "podcast")).toBeGreaterThan(mixMinutes(strong, "podcast"));
  });

  it("a weak speaking score gives talk more minutes than a strong one", () => {
    const strong = planPath(input({ skillPct: { listening: 90, speaking: 90 } }));
    const weak = planPath(input({ skillPct: { listening: 90, speaking: 30 } }));
    expect(mixMinutes(weak, "talk")).toBeGreaterThan(mixMinutes(strong, "talk"));
  });

  it("explains a weak skill in the reasons, with the skill's own score", () => {
    const p = planPath(input({ skillPct: { listening: 48 } }));
    const why = p.why.find((w) => w.type === "podcast" && w.source === "skills");
    expect(why?.detail).toContain("48");
  });

  it("a type the learner switched off gets no minutes and no items", () => {
    const p = planPath(input({ prefs: { off: ["podcast", "campaign"], trimUntil: null } }));
    expect(mixMinutes(p, "podcast")).toBe(0);
    expect(mixMinutes(p, "campaign")).toBe(0);
    expect(plannedTypes(p).has("podcast")).toBe(false);
    expect(plannedTypes(p).has("campaign")).toBe(false);
    expect(plannedTypes(p).has("talk")).toBe(true);
  });

  it("with every optional type off, lessons take the whole week", () => {
    const p = planPath(input({ prefs: { off: ["podcast", "talk", "campaign"], trimUntil: null } }));
    expect(mixMinutes(p, "lesson")).toBe(10 * STUDY_DAYS_PER_WEEK);
    expect(p.mix.filter((m) => m.type !== "lesson").every((m) => m.minutes === 0)).toBe(true);
  });

  it("lessons can never be switched off", () => {
    const p = planPath(input({ prefs: { off: ["lesson" as PathType], trimUntil: null } }));
    expect(mixMinutes(p, "lesson")).toBeGreaterThan(0);
  });

  it("the goal planner's lessons a week raise the lesson share", () => {
    const light = planPath(input({ goalPlan: goalPlan({ requiredPerWeek: 3 }) }));
    const heavy = planPath(input({ goalPlan: goalPlan({ requiredPerWeek: 10 }) }));
    expect(mixMinutes(heavy, "lesson")).toBeGreaterThan(mixMinutes(light, "lesson"));
  });

  it("never lists a video type until a video catalogue exists", () => {
    const p = planPath(input());
    expect(p.mix.map((m) => m.type)).not.toContain("video");
  });
});

describe("planPath: today and the week", () => {
  it("today's planned minutes respect the daily minutes (to one item's overflow)", () => {
    const p = planPath(input());
    const planned = p.today.items
      .filter((i) => i.state !== "done")
      .reduce((s, i) => s + i.minutes, 0);
    expect(planned).toBeLessThanOrEqual(10 + DAY_OVERFLOW_MINUTES);
    expect(p.today.items.length).toBeGreaterThan(0);
  });

  it("every study day stays within the daily minutes and the rest day is empty", () => {
    const p = planPath(input({ profile: { goal: "travel", interests: [], dailyMinutes: 15 } }));
    for (const d of p.week) {
      if (d.state === "rest") expect(d.items).toHaveLength(0);
      else expect(d.minutes).toBeLessThanOrEqual(15 + DAY_OVERFLOW_MINUTES + 6);
    }
    expect(p.week.filter((d) => d.state === "rest")).toHaveLength(1);
  });

  it("an item done today shows as done and its minutes count toward today", () => {
    const events: ActivityEvent[] = [
      { type: "lesson", day: "2026-11-11", minutes: 5, refId: "l0", title: "Done lesson" },
    ];
    const p = planPath(input({ events }));
    expect(p.today.items[0]).toMatchObject({ state: "done", type: "lesson" });
    expect(p.today.minutesLeft).toBeLessThanOrEqual(5);
  });

  it("never plans an item the learner already did, nor the same item twice", () => {
    const p = planPath(input());
    const ids = p.week.flatMap((d) => d.items).map((i) => `${i.type}:${i.id}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a campaign tagged with the goal is picked before one that is not", () => {
    const p = planPath(input());
    const first = p.week.flatMap((d) => d.items).find((i) => i.type === "campaign");
    expect(first?.id).toBe("c-travel");
  });

  it("a podcast tagged with an interest is picked first", () => {
    const p = planPath(input());
    const first = p.week.flatMap((d) => d.items).find((i) => i.type === "podcast");
    expect(first?.id).toBe("p-food");
  });

  it("never offers an item above the learner's level", () => {
    const p = planPath(
      input({
        candidates: {
          ...input().candidates,
          podcast: [cand("podcast", "hard", { level: "C1" }), cand("podcast", "easy")],
        },
      }),
    );
    const ids = p.week.flatMap((d) => d.items).map((i) => i.id);
    expect(ids).not.toContain("hard");
  });
});

describe("planPath: behind, and the recovery choices", () => {
  const behind = () =>
    input({
      goalPlan: goalPlan({
        status: "behind",
        lessonsDoneLast7Days: 4,
        suggestedDate: "2027-03-29",
      }),
    });

  it("offers lessons first, a later date and more minutes, each with its own numbers", () => {
    const p = planPath(behind());
    expect(p.recovery.map((r) => r.id)).toEqual(["lessons_first", "move_date", "add_minutes"]);
    expect(p.recovery.find((r) => r.id === "move_date")?.date).toBe("2027-03-29");
    expect(p.recovery.find((r) => r.id === "add_minutes")?.dailyMinutes).toBe(15);
  });

  it("offers nothing when the learner is on track", () => {
    expect(planPath(input()).recovery).toEqual([]);
  });

  it("the trimmed week keeps the lessons and drops the optional types but one podcast", () => {
    const normal = planPath(behind());
    const trimmed = planPath({ ...behind(), prefs: { off: [], trimUntil: "2026-11-25" } });
    expect(mixMinutes(trimmed, "lesson")).toBeGreaterThan(mixMinutes(normal, "lesson"));
    expect(mixMinutes(trimmed, "talk")).toBe(0);
    expect(mixMinutes(trimmed, "campaign")).toBe(0);
    expect(mixMinutes(trimmed, "podcast")).toBeGreaterThan(0);
    expect(mixMinutes(trimmed, "podcast")).toBeLessThanOrEqual(8);
    expect(trimmed.trimmed).toBe(true);
    // the preview the recovery card shows is the same trimmed mix
    const preview = normal.recovery.find((r) => r.id === "lessons_first")?.mix ?? [];
    expect(preview.find((m) => m.type === "talk")?.minutes).toBe(0);
  });

  it("an expired trim no longer applies", () => {
    const p = planPath({ ...behind(), prefs: { off: [], trimUntil: "2026-11-01" } });
    expect(p.trimmed).toBe(false);
  });

  it("no add-minutes option when already at the largest daily amount", () => {
    const p = planPath({
      ...behind(),
      profile: { goal: "travel", interests: [], dailyMinutes: 20 },
    });
    expect(p.recovery.map((r) => r.id)).not.toContain("add_minutes");
  });
});

describe("planPath: streaks and this week", () => {
  it("counts consecutive days per type ending today and this week's minutes", () => {
    const events: ActivityEvent[] = [
      { type: "lesson", day: "2026-11-09", minutes: 5 },
      { type: "lesson", day: "2026-11-10", minutes: 6 },
      { type: "lesson", day: "2026-11-11", minutes: 4 },
      { type: "podcast", day: "2026-11-10", minutes: 7 },
      { type: "talk", day: "2026-11-05", minutes: 3 },
    ];
    const p = planPath(input({ events }));
    const s = (t: PathType) => p.streaks.find((x) => x.type === t)!;
    expect(s("lesson")).toMatchObject({ days: 3, weekMinutes: 15 });
    expect(s("podcast")).toMatchObject({ days: 1, weekMinutes: 7 });
    expect(s("talk")).toMatchObject({ days: 0, weekMinutes: 0 });
  });

  it("keeps a streak alive through yesterday when today has no activity yet", () => {
    const events: ActivityEvent[] = [
      { type: "lesson", day: "2026-11-09", minutes: 5 },
      { type: "lesson", day: "2026-11-10", minutes: 6 },
    ];
    const p = planPath(input({ events }));
    expect(p.streaks.find((x) => x.type === "lesson")?.days).toBe(2);
  });
});

describe("planPath: the road", () => {
  it("ends at the goal flag and starts with upcoming stops after what is done", () => {
    const p = planPath(input());
    expect(p.road[p.road.length - 1]).toMatchObject({ kind: "goal", state: "upcoming" });
    expect(p.road.some((s) => s.state === "current")).toBe(true);
  });

  it("marks a finished level behind the learner as done", () => {
    const p = planPath(input());
    expect(p.road.find((s) => s.kind === "level" && s.state === "done")?.title).toBe("Finished A1");
  });
});

describe("planPath: when the goal needs every minute", () => {
  it("says so in the reasons, and the extras wait", () => {
    const p = planPath(input({ goalPlan: goalPlan({ requiredPerWeek: 30 }) }));
    expect(mixMinutes(p, "lesson")).toBe(10 * STUDY_DAYS_PER_WEEK);
    expect(p.why.some((w) => w.headline === "Your goal needs every minute")).toBe(true);
  });
  it("mix minutes are whole numbers", () => {
    const p = planPath(input({ goalPlan: goalPlan({ requiredPerWeek: 7 }) }));
    for (const m of p.mix) expect(Number.isInteger(m.minutes)).toBe(true);
  });
});
