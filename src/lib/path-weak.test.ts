import { describe, expect, it } from "vitest";
import { getCourse } from "@/data/courses";
import {
  REFRESHER_COOLDOWN_DAYS,
  WEAK_SPOTS_MAX_MINUTES,
  WEAK_SPOTS_MIN_ITEMS,
} from "@/data/path-config";
import { REFRESHER_UNIT_PATTERNS } from "@/data/refresher-topics";
import { LEVEL_ORDER, planGoal, MAX_GOAL_DAYS } from "./learning-goal";
import { suggestGoal } from "./suggest-goal";
import { lessonsByLevel } from "./learning-goal.server";
import { buildLearningPath, refresherOfferToSave, type PathData } from "./learning-path-data";
import { learnerProfilePatchSchema, parseLearnerProfile } from "./learner-profile";
import { RECAP_TOPICS } from "./call-recap";
import {
  planPath,
  weakSpotsMinutes,
  type Candidate,
  type PathInput,
  type WeakInput,
} from "./path-plan";

// Wednesday 2026-11-11 (UTC), a study day (the rest day is Sunday).
const NOW = new Date("2026-11-11T10:00:00Z");
const units = getCourse("en").curriculum;
const allLessons = units.flatMap((u) => u.lessons);

const plurals = (id: string): Candidate => ({
  id,
  type: "lesson",
  title: "Plurals 1",
  subtitle: "Plurals · A1",
  minutes: 4,
  level: "A1",
  goals: [],
  interests: [],
  skills: [],
  ref: { kind: "lesson", id },
});

const weak = (over: Partial<WeakInput> = {}): WeakInput => ({
  reviewDue: 0,
  callMistakes: 0,
  categories: [],
  offered: null,
  ...over,
});

const cat = (count: number, lesson: Candidate | null = plurals("a1p1l1")) => ({
  category: "plurals",
  label: "Plurals",
  count,
  lesson,
});

/** The engine's input built the way the data layer builds it, so these tests exercise the real planPath. */
function engineInput(over: Partial<PathInput> = {}): PathInput {
  return {
    now: NOW,
    course: "en",
    goalPlan: planGoal({
      currentLevel: "A1",
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
      lesson: allLessons.slice(0, 20).map((l) => ({
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

function baseData(over: Partial<PathData> = {}): PathData {
  return {
    course: "en",
    now: NOW,
    currentLevel: "A1",
    goal: { targetLevel: "A2", targetDate: "2027-06-01", createdAt: "2026-10-01T00:00:00.000Z" },
    completions: [],
    learningDays: [],
    skillDays: [],
    episodes: [],
    listen: [],
    videos: [],
    videoWatches: [],
    calls: [],
    stars: [],
    profile: { showFlag: false, dailyMinutes: 10 },
    ...over,
  };
}

const todayIds = (p: ReturnType<typeof planPath>) => (p.fix?.items ?? []).map((i) => i.id);

describe("suggested goal (path v2, A)", () => {
  const byLevel = lessonsByLevel("en");
  const suggest = (over: Partial<Parameters<typeof suggestGoal>[0]> = {}) =>
    suggestGoal({
      currentLevel: "A1",
      now: NOW,
      lessonsByLevel: byLevel,
      completedAt: {},
      dailyMinutes: 10,
      studyDays: 6,
      lessonMinutes: 5,
      ...over,
    });

  it("targets the next CEFR level", () => {
    expect(suggest().targetLevel).toBe("A2");
    expect(suggest({ currentLevel: "B1" }).targetLevel).toBe("B2");
  });

  it("keeps the level at C1 (there is no next one)", () => {
    expect(suggest({ currentLevel: "C1" }).targetLevel).toBe("C1");
  });

  it("is a date the planner calls realistic, at about 90 days when the lessons fit", () => {
    const b1 = suggest({ currentLevel: "B1", dailyMinutes: 20, lessonMinutes: 3 });
    const plan = planGoal({
      currentLevel: "B1",
      targetLevel: b1.targetLevel,
      targetDate: b1.targetDate,
      lessonsByLevel: byLevel,
      completedAt: {},
      goalCreatedAt: null,
      now: NOW,
    })!;
    expect(plan.realism).toBe("ok");
    const days =
      (Date.parse(`${b1.targetDate}T00:00:00Z`) - Date.parse("2026-11-11T00:00:00Z")) / 86_400_000;
    expect(days).toBeGreaterThanOrEqual(90);
  });

  it("moves the date out for a learner with few minutes, never beyond three years", () => {
    const quick = suggest({ dailyMinutes: 30 });
    const slow = suggest({ dailyMinutes: 5 });
    expect(slow.targetDate > quick.targetDate).toBe(true);
    const capped = suggest({ dailyMinutes: 1, lessonMinutes: 60 });
    const days =
      (Date.parse(`${capped.targetDate}T00:00:00Z`) - Date.parse("2026-11-11T00:00:00Z")) /
      86_400_000;
    expect(days).toBeLessThanOrEqual(MAX_GOAL_DAYS);
  });

  it("its plan is never 'ambitious' or 'unrealistic' for a normal learner", () => {
    for (const level of LEVEL_ORDER) {
      const g = suggest({ currentLevel: level, dailyMinutes: 10 });
      const plan = planGoal({
        currentLevel: level,
        targetLevel: g.targetLevel,
        targetDate: g.targetDate,
        lessonsByLevel: byLevel,
        completedAt: {},
        goalCreatedAt: null,
        now: NOW,
      });
      expect(plan?.realism, level).toBe("ok");
    }
  });
});

describe("buildLearningPath with no saved goal (path v2, A)", () => {
  it("builds a path flagged suggested, targeting the level after the current one", () => {
    const path = buildLearningPath(baseData({ goal: null }))!;
    expect(path.goal.suggested).toBe(true);
    expect(path.progress.targetLevel).toBe("A2");
    expect(path.today.items.length).toBeGreaterThan(0);
  });

  it("a saved goal is not flagged", () => {
    expect(buildLearningPath(baseData())!.goal.suggested).toBe(false);
  });

  it("missing first-run answers fall back to the default minutes, with no goal or interests", () => {
    const path = buildLearningPath(baseData({ goal: null, profile: { showFlag: false } }))!;
    expect(path.dailyMinutes).toBe(10);
    expect(path.goal.suggested).toBe(true);
  });

  it("starts from the learner's level (a placement result), not from A1", () => {
    const path = buildLearningPath(baseData({ goal: null, currentLevel: "B1" }))!;
    expect(path.progress.targetLevel).toBe("B2");
  });
});

describe("Fix your weak spots (path v2, B)", () => {
  it("appears with the threshold of items, in Today, with a Review ref", () => {
    const p = planPath(engineInput({ weak: weak({ reviewDue: WEAK_SPOTS_MIN_ITEMS }) }));
    const item = p.fix?.items.find((i) => i.id === "weakspots");
    expect(item).toMatchObject({ subtitle: "Fix your weak spots", ref: { kind: "review" } });
    expect(p.today.items.some((i) => i.id === "weakspots")).toBe(false);
  });

  it("does not appear below the threshold", () => {
    const p = planPath(engineInput({ weak: weak({ reviewDue: WEAK_SPOTS_MIN_ITEMS - 1 }) }));
    expect(todayIds(p)).not.toContain("weakspots");
  });

  it("counts due Review items and call mistakes together", () => {
    const p = planPath(engineInput({ weak: weak({ reviewDue: 1, callMistakes: 2 }) }));
    expect(todayIds(p)).toContain("weakspots");
  });

  it("is placed once a day: only today, once, never on the days ahead", () => {
    const p = planPath(engineInput({ weak: weak({ reviewDue: 6 }) }));
    expect(p.fix!.items.filter((i) => i.id === "weakspots")).toHaveLength(1);
    expect(p.week.flatMap((d) => d.items).some((i) => i.id === "weakspots")).toBe(false);
    const todayMin = p.week.find((d) => d.day === p.today.day)!.minutes;
    expect(todayMin).toBeGreaterThanOrEqual(p.fix!.minutes);
  });

  it("is left out on the rest day", () => {
    const p = planPath(
      engineInput({
        now: new Date("2026-11-15T10:00:00Z"),
        weak: weak({ reviewDue: 6 }),
      }),
    );
    expect(todayIds(p)).not.toContain("weakspots");
  });

  it("estimates minutes from the count, with a ceiling", () => {
    expect(weakSpotsMinutes(3)).toBe(1);
    expect(weakSpotsMinutes(12)).toBe(4);
    expect(weakSpotsMinutes(500)).toBe(WEAK_SPOTS_MAX_MINUTES);
    const p = planPath(engineInput({ weak: weak({ reviewDue: 12 }) }));
    expect(p.fix!.items.find((i) => i.id === "weakspots")!.minutes).toBe(4);
  });

  it("makes room: today's lessons shrink by the minutes it takes", () => {
    const without = planPath(engineInput());
    const withWeak = planPath(engineInput({ weak: weak({ reviewDue: 30 }) }));
    const lessonMin = (p: typeof without) =>
      p.today.items.filter((i) => i.id !== "weakspots").reduce((s, i) => s + i.minutes, 0);
    expect(lessonMin(withWeak)).toBeLessThan(lessonMin(without));
  });
});

describe("the refresher (path v2, B)", () => {
  const refresherOf = (p: ReturnType<typeof planPath>) =>
    (p.fix?.items ?? []).find((i) => i.title.startsWith("Refresher"));

  it("is offered when a category repeats 3 times, with the reason in the subtitle", () => {
    const p = planPath(engineInput({ weak: weak({ categories: [cat(3)] }) }));
    const r = refresherOf(p)!;
    expect(r).toMatchObject({ id: "a1p1l1", ref: { kind: "lesson", id: "a1p1l1" } });
    expect(r.title).toBe("Refresher: Plurals (A1)");
    expect(r.subtitle).toBe("You mixed up plurals 3 times");
  });

  it("is not offered for 2 detections when the skill is fine", () => {
    const p = planPath(engineInput({ weak: weak({ categories: [cat(2)] }) }));
    expect(refresherOf(p)).toBeUndefined();
  });

  it("is offered below 3 when the skill is already weak", () => {
    const p = planPath(
      engineInput({
        skillPct: { grammar: 50 },
        weak: weak({ categories: [cat(1)] }),
      }),
    );
    expect(refresherOf(p)).toBeDefined();
  });

  it("a weak skill alone, with no detection at all, offers nothing (no category to name)", () => {
    const p = planPath(engineInput({ skillPct: { grammar: 50 }, weak: weak() }));
    expect(refresherOf(p)).toBeUndefined();
  });

  it("is not offered when no completed lesson trains the category", () => {
    const p = planPath(engineInput({ weak: weak({ categories: [cat(5, null)] }) }));
    expect(refresherOf(p)).toBeUndefined();
  });

  it("the same refresher stays all day it was offered, then rests for the cooldown, then comes back", () => {
    const at = (offeredOn: string, now: string, lessonId = "a1p1l1") =>
      refresherOf(
        planPath(
          engineInput({
            now: new Date(now),
            weak: weak({ categories: [cat(3)], offered: { lessonId, offeredOn } }),
          }),
        ),
      );
    expect(REFRESHER_COOLDOWN_DAYS).toBe(3);
    expect(at("2026-11-11", "2026-11-11T10:00:00Z")).toBeDefined();
    expect(at("2026-11-10", "2026-11-11T10:00:00Z")).toBeUndefined();
    expect(at("2026-11-09", "2026-11-11T10:00:00Z")).toBeUndefined();
    expect(at("2026-11-08", "2026-11-11T10:00:00Z")).toBeDefined();
  });

  it("on the day of the offer, only the offered lesson is offered, not another one", () => {
    const p = planPath(
      engineInput({
        weak: weak({
          categories: [
            { ...cat(5), category: "articles", label: "Articles", lesson: plurals("other") },
            cat(3),
          ],
          offered: { lessonId: "a1p1l1", offeredOn: "2026-11-11" },
        }),
      }),
    );
    expect(refresherOf(p)?.id).toBe("a1p1l1");
  });

  it("is only one item, for the category that repeats most", () => {
    const p = planPath(
      engineInput({
        weak: weak({
          categories: [
            { ...cat(3), category: "articles", label: "Articles" },
            { ...cat(5), category: "plurals", label: "Plurals" },
          ],
        }),
      }),
    );
    const refreshers = (p.fix?.items ?? []).filter((i) => i.title.startsWith("Refresher"));
    expect(refreshers).toHaveLength(1);
    expect(refreshers[0].subtitle).toContain("5 times");
  });
});

describe("the category to lesson mapping (path v2, B)", () => {
  const completedAll = (course: "en" | "fr" | "es") =>
    getCourse(course).curriculum.flatMap((u) =>
      u.lessons.map((l) => ({ lessonId: l.id, completedAt: "2026-01-01T08:00:00.000Z" })),
    );
  const refresherFor = (course: "en" | "fr" | "es", category: string) => {
    const path = buildLearningPath(
      baseData({
        course,
        currentLevel: "A1",
        completions: completedAll(course),
        weak: {
          reviewDue: [],
          weaknessEvents: [1, 2, 3].map((d) => ({
            category,
            eventType: "detected",
            createdAt: `2026-11-0${d}T09:00:00.000Z`,
          })),
          mistakes: [1, 2, 3]
            .map(() => ({
              topic: category,
              seenCount: 3,
              createdAt: "2026-11-02T09:00:00.000Z",
              lastSeenAt: "2026-11-09T09:00:00.000Z",
            }))
            .slice(0, 1),
        },
      }),
    );
    return path?.fix?.items.find((i) => i.title.startsWith("Refresher"));
  };

  it("every pattern matches a real unit of its course, and every category is a real one", () => {
    for (const course of ["en", "fr", "es"] as const) {
      const titles = getCourse(course).curriculum.map((u) => u.title);
      for (const [category, pattern] of Object.entries(REFRESHER_UNIT_PATTERNS[course])) {
        expect(
          RECAP_TOPICS[course][category],
          `${course}/${category} is a real topic`,
        ).toBeDefined();
        expect(
          titles.some((t) => pattern.test(t)),
          `${course}/${category} matches a unit`,
        ).toBe(true);
      }
    }
  });

  it("maps past-tense to a Past Simple style unit, plurals to Plurals, and picks a COMPLETED lesson", () => {
    expect(refresherFor("en", "plurals")?.id).toMatch(/^a1p1l/);
    const past = refresherFor("en", "past-tense")!;
    const pastUnits = units.filter((u) => /past|yesterday/i.test(u.title));
    expect(pastUnits.some((u) => u.lessons.some((l) => l.id === past.id))).toBe(true);
  });

  it("maps French and Spanish call topics to their own units", () => {
    const fr = refresherFor("fr", "tense-choice")!;
    const frUnits = getCourse("fr").curriculum;
    expect(frUnits.find((u) => u.lessons.some((l) => l.id === fr.id))!.title).toMatch(
      /passé composé|imparfait|futur|conditionnel|aller/i,
    );
    const es = refresherFor("es", "ser-estar")!;
    const esUnit = getCourse("es").curriculum.find((u) => u.lessons.some((l) => l.id === es.id))!;
    expect(esUnit.title).toMatch(/ser vs/i);
  });

  it("offers a lesson the learner has NOT completed never: with nothing completed there is no refresher", () => {
    const path = buildLearningPath(
      baseData({
        weak: {
          reviewDue: [],
          weaknessEvents: [1, 2, 3].map((d) => ({
            category: "plurals",
            eventType: "detected",
            createdAt: `2026-11-0${d}T09:00:00.000Z`,
          })),
          mistakes: [],
        },
      }),
    )!;
    expect((path.fix?.items ?? []).some((i) => i.title.startsWith("Refresher"))).toBe(false);
  });

  it("a French learner's French weak-spot events make a refresher (the loader scopes them to the course)", () => {
    const path = buildLearningPath(
      baseData({
        course: "fr",
        completions: completedAll("fr"),
        weak: {
          reviewDue: [],
          weaknessEvents: [1, 2, 3].map((d) => ({
            category: "gender-agreement",
            eventType: "detected",
            createdAt: `2026-11-0${d}T09:00:00.000Z`,
          })),
          mistakes: [],
        },
      }),
    )!;
    expect((path.fix?.items ?? []).some((i) => i.title.startsWith("Refresher"))).toBe(true);
  });

  it("an event whose category is not a topic of the course is ignored", () => {
    const path = buildLearningPath(
      baseData({
        course: "fr",
        completions: completedAll("fr"),
        weak: {
          reviewDue: [],
          weaknessEvents: [1, 2, 3].map((d) => ({
            category: "plurals",
            eventType: "detected",
            createdAt: `2026-11-0${d}T09:00:00.000Z`,
          })),
          mistakes: [],
        },
      }),
    )!;
    expect((path.fix?.items ?? []).some((i) => i.title.startsWith("Refresher"))).toBe(false);
  });

  it("a resolved weakness stops counting (detected minus resolved)", () => {
    const rows = [
      ...[1, 2, 3].map((d) => ({
        category: "plurals",
        eventType: "detected",
        createdAt: `2026-11-0${d}T09:00:00.000Z`,
      })),
      { category: "plurals", eventType: "resolved", createdAt: "2026-11-05T09:00:00.000Z" },
    ];
    const path = buildLearningPath(
      baseData({
        completions: completedAll("en"),
        weak: { reviewDue: [], weaknessEvents: rows, mistakes: [] },
      }),
    )!;
    expect((path.fix?.items ?? []).some((i) => i.title.startsWith("Refresher"))).toBe(false);
  });

  it("detections older than the window do not count", () => {
    const path = buildLearningPath(
      baseData({
        completions: completedAll("en"),
        weak: {
          reviewDue: [],
          weaknessEvents: [1, 2, 3].map((d) => ({
            category: "plurals",
            eventType: "detected",
            createdAt: `2026-09-0${d}T09:00:00.000Z`,
          })),
          mistakes: [],
        },
      }),
    )!;
    expect((path.fix?.items ?? []).some((i) => i.title.startsWith("Refresher"))).toBe(false);
  });

  it("the recorded offer (profile metadata) drives the cooldown, with production-shaped data", () => {
    const events = [1, 2, 3].map((d) => ({
      category: "plurals",
      eventType: "detected",
      createdAt: `2026-11-0${d}T09:00:00.000Z`,
    }));
    const build = (offeredOn: string | null) =>
      buildLearningPath(
        baseData({
          completions: completedAll("en"),
          weak: { reviewDue: [], weaknessEvents: events, mistakes: [] },
          profile: {
            showFlag: false,
            dailyMinutes: 10,
            ...(offeredOn ? { pathRefresher: { en: { lessonId: "a1p1l1", offeredOn } } } : {}),
          },
        }),
      )!;
    const has = (p: ReturnType<typeof build>) =>
      (p.fix?.items ?? []).some((i) => i.title.startsWith("Refresher"));
    expect(has(build(null))).toBe(true);
    expect(has(build("2026-11-10"))).toBe(false);
    expect(has(build("2026-11-08"))).toBe(true);
    // Another course's offer does not rest this course's refresher.
    const other = baseData({
      completions: completedAll("en"),
      weak: { reviewDue: [], weaknessEvents: events, mistakes: [] },
      profile: {
        showFlag: false,
        dailyMinutes: 10,
        pathRefresher: { fr: { lessonId: "x", offeredOn: "2026-11-10" } },
      },
    });
    expect(has(buildLearningPath(other)!)).toBe(true);
  });

  it("a call mistake that is already a due Review item is counted once, not twice", () => {
    const path = buildLearningPath(
      baseData({
        weak: {
          reviewDue: [
            { itemKey: "a", weaknessLabel: "plurals" },
            { itemKey: "b", weaknessLabel: null },
          ],
          weaknessEvents: [],
          mistakes: [
            {
              topic: "plurals",
              seenCount: 1,
              createdAt: "2026-11-09T09:00:00.000Z",
              lastSeenAt: "2026-11-09T09:00:00.000Z",
            },
          ],
        },
      }),
    )!;
    // 2 due + 0 new call mistakes = 2: below the threshold of 3, so no weak-spots item.
    expect((path.fix?.items ?? []).some((i) => i.id === "weakspots")).toBe(false);
  });
});

describe("the Fix before it sticks card (path v2)", () => {
  it("is hidden when there is nothing to fix", () => {
    expect(planPath(engineInput()).fix).toBeNull();
    expect(planPath(engineInput({ weak: weak({ reviewDue: 2 }) })).fix).toBeNull();
  });

  it("says one weak spot (singular) for a single item", () => {
    const fix = planPath(engineInput({ weak: weak({ reviewDue: 4 }) })).fix!;
    expect(fix.title).toBe("One weak spot to tidy up");
    expect(fix.items).toHaveLength(1);
  });

  it("says two weak spots (plural) for both items, and sums the minutes in the overline", () => {
    const fix = planPath(engineInput({ weak: weak({ reviewDue: 9, categories: [cat(3)] }) })).fix!;
    expect(fix.title).toBe("Two weak spots to tidy up");
    expect(fix.minutes).toBe(3 + 4);
    expect(fix.overline).toBe("Fix before it sticks \u00B7 7 min");
    expect(fix.items.map((i) => i.title)).toEqual([
      "9 items due in Review",
      "Refresher: Plurals (A1)",
    ]);
  });

  it("names phrases from calls when there are call mistakes", () => {
    const fix = planPath(engineInput({ weak: weak({ reviewDue: 1, callMistakes: 2 }) })).fix!;
    expect(fix.items[0].title).toBe("3 phrases from your recent calls and Review");
  });

  it("is switched off by the learner's setting, but the engine still reports the switch", () => {
    const p = planPath(
      engineInput({
        prefs: { off: [], trimUntil: null, fixOff: true },
        weak: weak({ reviewDue: 9 }),
      }),
    );
    expect(p.fix).toBeNull();
    expect(p.fixOff).toBe(true);
    expect(planPath(engineInput()).fixOff).toBe(false);
  });

  it("the Built-from sentence reads the answers back", () => {
    const p = planPath(
      engineInput({ profile: { goal: "work", interests: ["tech", "sport"], dailyMinutes: 20 } }),
    );
    expect(p.goal.built).toBe(
      "Built from your answers: work, 20 min a day, placed at A1, interests in tech and sport.",
    );
    expect(planPath(engineInput()).goal.built).toBe(
      "Built from your answers: 10 min a day, placed at A1.",
    );
  });
});

describe("Why this mix explains weak spots and the refresher (path v2, B)", () => {
  it("says what is waiting, how long it takes, and the once-a-day rule", () => {
    const p = planPath(engineInput({ weak: weak({ reviewDue: 4, callMistakes: 2 }) }));
    const w = p.why.find((x) => x.headline === "Fix your weak spots")!;
    expect(w.source).toBe("weak");
    expect(w.detail).toContain("6 items are waiting (4 in Review and 2 from your recent calls)");
    expect(w.detail).toContain("about 2 min");
    expect(w.detail).toContain("once a day");
  });

  it("names the repeated slip and the cooldown for the refresher", () => {
    const p = planPath(engineInput({ weak: weak({ categories: [cat(4)] }) }));
    const w = p.why.find((x) => x.headline === "Refresher: Plurals")!;
    expect(w.detail).toContain("You mixed up plurals 4 times in the last 14 days");
    expect(w.detail).toContain("every 3 days");
  });

  it("says nothing about either when neither is on today's list", () => {
    const p = planPath(engineInput({ weak: weak({ reviewDue: 1 }) }));
    expect(p.why.some((x) => x.source === "weak")).toBe(false);
  });
});

describe("recording the refresher offer (path v2)", () => {
  const events = [1, 2, 3].map((d) => ({
    category: "plurals",
    eventType: "detected",
    createdAt: `2026-11-0${d}T09:00:00.000Z`,
  }));
  const base = (profile: PathData["profile"] = { showFlag: false, dailyMinutes: 10 }) =>
    baseData({
      completions: [{ lessonId: "a1p1l1", completedAt: "2026-10-20T08:00:00.000Z" }],
      weak: { reviewDue: [], weaknessEvents: events, mistakes: [] },
      profile,
    });

  it("a new refresher is recorded for today, keeping the other courses' offers", () => {
    const data = base({
      showFlag: false,
      dailyMinutes: 10,
      pathRefresher: { fr: { lessonId: "x", offeredOn: "2026-10-01" } },
    });
    expect(refresherOfferToSave(buildLearningPath(data), data.profile, "en")).toEqual({
      fr: { lessonId: "x", offeredOn: "2026-10-01" },
      en: { lessonId: "a1p1l1", offeredOn: "2026-11-11" },
    });
  });

  it("an offer already recorded for today is not saved again; no refresher saves nothing", () => {
    const data = base({
      showFlag: false,
      dailyMinutes: 10,
      pathRefresher: { en: { lessonId: "a1p1l1", offeredOn: "2026-11-11" } },
    });
    expect(refresherOfferToSave(buildLearningPath(data), data.profile, "en")).toBeNull();
    const none = baseData();
    expect(refresherOfferToSave(buildLearningPath(none), none.profile, "en")).toBeNull();
  });

  it("the same lesson offered again after the cooldown is a new offer, recorded with today's day", () => {
    const data = base({
      showFlag: false,
      dailyMinutes: 10,
      pathRefresher: { en: { lessonId: "a1p1l1", offeredOn: "2026-11-01" } },
    });
    expect(refresherOfferToSave(buildLearningPath(data), data.profile, "en")).toEqual({
      en: { lessonId: "a1p1l1", offeredOn: "2026-11-11" },
    });
  });

  it("the profile schema accepts the record and rejects junk", () => {
    expect(
      learnerProfilePatchSchema.safeParse({
        pathRefresher: { en: { lessonId: "a1p1l1", offeredOn: "2026-11-11" } },
      }).success,
    ).toBe(true);
    expect(
      learnerProfilePatchSchema.safeParse({
        pathRefresher: { en: { lessonId: "", offeredOn: "x" } },
      }).success,
    ).toBe(false);
    expect(
      parseLearnerProfile({ pathRefresher: { en: { lessonId: "a1p1l1", offeredOn: "nope" } } })
        .pathRefresher,
    ).toBeUndefined();
  });
});
