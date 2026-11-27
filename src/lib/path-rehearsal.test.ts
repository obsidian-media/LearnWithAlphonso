import { describe, expect, it } from "vitest";
import { getCourse } from "@/data/courses";
import { LEVEL_ORDER, planGoal } from "./learning-goal";
import { lessonsByLevel } from "./learning-goal.server";
import { planPath, type PathInput, type RehearsalPathInput } from "./path-plan";

const lessons = getCourse("en").curriculum.flatMap((u) => u.lessons);

// Wednesday 2026-11-11 10:00 UTC.
const NOW = new Date("2026-11-11T10:00:00Z");

function input(over: Partial<PathInput> = {}): PathInput {
  return {
    now: NOW,
    course: "en",
    goalPlan: planGoal({
      currentLevel: LEVEL_ORDER[0],
      targetLevel: "A2",
      targetDate: "2027-06-01",
      lessonsByLevel: lessonsByLevel("en"),
      completedAt: {},
      goalCreatedAt: "2026-10-01T00:00:00.000Z",
      now: NOW,
    })!,
    goalLabel: "A2 by 1 June",
    profile: { interests: [], dailyMinutes: 10 },
    prefs: { off: [], trimUntil: null },
    skillPct: {},
    candidates: {
      lesson: lessons.slice(0, 20).map((l) => ({
        id: l.id,
        type: "lesson" as const,
        title: l.title,
        subtitle: "",
        minutes: 5,
        level: "A1" as const,
        goals: [],
        interests: [],
        skills: [],
        ref: { kind: "lesson" as const, id: l.id },
      })),
      podcast: [],
      talk: [],
      campaign: [],
      video: [],
    },
    events: [],
    ...over,
  };
}

const rehearsal = (over: Partial<RehearsalPathInput> = {}): RehearsalPathInput => ({
  id: "11111111-1111-4111-8111-111111111111",
  eventKind: "interview",
  eventDate: "2026-11-16",
  nextStage: "conversation",
  allDone: false,
  lastRunDay: null,
  ...over,
});

describe("path: the pinned rehearsal item ", () => {
  it("has no pinned item without a rehearsal", () => {
    expect(planPath(input()).pinned).toEqual([]);
  });

  it("adds exactly one pinned item on a study day, for the next stage", () => {
    const p = planPath(input({ rehearsal: rehearsal() }));
    expect(p.pinned).toHaveLength(1);
    expect(p.pinned[0]).toMatchObject({
      kind: "stage",
      eventKind: "interview",
      stage: "conversation",
      rehearsalId: rehearsal().id,
      hero: false,
    });
  });

  it("adds nothing on the learner's rest day", () => {
    // 2026-11-15 is a Sunday, the default rest day.
    const p = planPath(input({ now: new Date("2026-11-15T10:00:00Z"), rehearsal: rehearsal() }));
    expect(p.pinned).toEqual([]);
  });

  it("adds nothing once the learner has rehearsed today", () => {
    const p = planPath(input({ rehearsal: rehearsal({ lastRunDay: "2026-11-11" }) }));
    expect(p.pinned).toEqual([]);
  });

  it("on the event day offers the 2-minute warm-up, and it takes the Learn hero", () => {
    const p = planPath(
      input({
        now: new Date("2026-11-16T10:00:00Z"),
        rehearsal: rehearsal({ nextStage: "hard_moments", allDone: false }),
      }),
    );
    expect(p.pinned).toHaveLength(1);
    expect(p.pinned[0]).toMatchObject({
      kind: "warmup_today",
      stage: "warmup",
      minutes: 2,
      hero: true,
      title: "2-minute warm-up before your interview",
    });
  });

  it("the day after the event asks 'How did it go?' once and offers no stage", () => {
    const p = planPath(input({ now: new Date("2026-11-17T10:00:00Z"), rehearsal: rehearsal() }));
    expect(p.pinned).toHaveLength(1);
    expect(p.pinned[0]).toMatchObject({ kind: "followup", stage: null, title: "How did it go?" });
  });

  it("asks on day 3 after the event (the last day) and not on day 4", () => {
    // The event is 2026-11-16: day 3 is the 19th, day 4 the 20th (a Friday, a study day).
    const on = (day: string) =>
      planPath(input({ now: new Date(`${day}T10:00:00Z`), rehearsal: rehearsal() })).pinned;
    expect(on("2026-11-19")[0]?.kind).toBe("followup");
    expect(on("2026-11-20")).toEqual([]);
  });

  it("stops asking after a few days, so an unanswered question does not nag", () => {
    const p = planPath(input({ now: new Date("2026-11-25T10:00:00Z"), rehearsal: rehearsal() }));
    expect(p.pinned).toEqual([]);
  });

  it("with no date offers a stage every other day while stages remain", () => {
    const undated = (lastRunDay: string | null) =>
      planPath(input({ rehearsal: rehearsal({ eventDate: null, lastRunDay }) })).pinned;
    expect(undated(null)).toHaveLength(1);
    expect(undated("2026-11-10")).toEqual([]); // yesterday: not yet
    expect(undated("2026-11-09")).toHaveLength(1); // two days ago
  });

  it("with no date and every stage done, offers one a week", () => {
    const undated = (lastRunDay: string) =>
      planPath(input({ rehearsal: rehearsal({ eventDate: null, allDone: true, lastRunDay }) }))
        .pinned;
    expect(undated("2026-11-07")).toEqual([]);
    expect(undated("2026-11-04")).toHaveLength(1);
  });

  it("follows the learner's local day, not UTC, near midnight (the event is their today)", () => {
    // 2026-11-16 23:30 UTC is already 2026-11-17 in Auckland: the day after the event there.
    const near = new Date("2026-11-16T23:30:00Z");
    const auckland = planPath(
      input({ now: near, timeZone: "Pacific/Auckland", rehearsal: rehearsal() }),
    );
    expect(auckland.pinned[0]?.kind).toBe("followup");
    // And 2026-11-17 00:30 UTC is still 2026-11-16 in Los Angeles: the event day there, not the day after.
    const la = planPath(
      input({
        now: new Date("2026-11-17T00:30:00Z"),
        timeZone: "America/Los_Angeles",
        rehearsal: rehearsal(),
      }),
    );
    expect(la.pinned[0]?.kind).toBe("warmup_today");
  });

  it("does not change the plan's minutes or Today's items", () => {
    const without = planPath(input());
    const withIt = planPath(input({ rehearsal: rehearsal() }));
    expect(withIt.today.items).toEqual(without.today.items);
    expect(withIt.today.targetMinutes).toBe(without.today.targetMinutes);
    expect(withIt.weekMinutes).toBe(without.weekMinutes);
    expect(withIt.mix).toEqual(without.mix);
  });

  it("is a different thing from the Fix before it sticks card", () => {
    const p = planPath(input({ rehearsal: rehearsal() }));
    expect(p.fix).toBeNull();
    expect(p.pinned).toHaveLength(1);
  });
});
