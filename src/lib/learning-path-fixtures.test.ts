import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLearningPath, type PathData } from "./learning-path-data";
import { isPath } from "./learning-path-client";
import { getCourse } from "@/data/courses";

/**
 * The contract iOS and Android decode: src/lib/learning-path.fixtures.json holds the exact /api/learning-path answer
 * for two fixed learners (one on track, one behind with a trim). The engine's output is compared to the file, so the
 * file cannot drift from the server; regenerate with UPDATE_PATH_FIXTURES=1. The Swift and Kotlin tests decode this same
 * file and check the same values, so the three platforms agree on the shape and the numbers.
 */
const FILE = new URL("./learning-path.fixtures.json", import.meta.url);
const NOW = new Date("2026-11-11T10:00:00Z");
const lessons = getCourse("en").curriculum.flatMap((u) => u.lessons);

const savedGoal = {
  targetLevel: "A2",
  targetDate: "2027-06-01",
  createdAt: "2026-10-01T00:00:00.000Z",
} as const;

const base: PathData = {
  course: "en",
  now: NOW,
  currentLevel: "A1",
  goal: savedGoal,
  completions: lessons.slice(0, 6).map((l, i) => ({
    lessonId: l.id,
    completedAt: `2026-11-0${Math.min(9, i + 4)}T08:00:00.000Z`,
  })),
  learningDays: [{ day: "2026-11-09", lessonSeconds: 600, practiceSeconds: 0 }],
  skillDays: [
    { day: "2026-11-09", skill: "listening", right: 2, total: 6 },
    { day: "2026-11-09", skill: "speaking", right: 5, total: 6 },
  ],
  episodes: [
    {
      id: "ep-coffee",
      folder: "a1",
      slug: "ordering-coffee-v2",
      title: "Ordering coffee",
      durationSeconds: 173,
      levelId: "A1",
    },
  ],
  listen: [],
  videos: [],
  videoWatches: [],
  calls: [],
  stars: [],
  profile: { showFlag: false, goal: "travel", interests: ["food"], dailyMinutes: 10 },
};

const scenarios: Record<string, PathData> = {
  onTrack: { ...base, goal: { ...savedGoal, targetDate: "2028-06-01" } },
  behind: base,
  restDayChosen: { ...base, profile: { ...base.profile, pathRestDay: 3 } },
  // An Alphonso video (Library > Watch) is on the path: a "video" stop with a ref the apps open in the player.
  withVideo: {
    ...base,
    videos: [
      {
        id: "vid-order",
        title: "I'd like vs I want",
        durationSeconds: 49,
        levelId: "A1",
        tags: ["travel", "food", "ordering"],
      },
    ],
  },
  noRestDay: { ...base, profile: { ...base.profile, pathRestDay: "none" } },
  // v2: no saved goal. The path is built from a SUGGESTED one (goal.suggested) and nothing is saved.
  noGoal: { ...base, goal: null },
  // v2: five Review items due, and "plurals" detected three times: "Fix your weak spots" (a Review ref) and a refresher
  // (an earlier completed Plurals lesson, an ordinary lesson ref) are in Today.
  weakSpots: {
    ...base,
    completions: [
      ...base.completions,
      { lessonId: "a1p1l1", completedAt: "2026-10-20T08:00:00.000Z" },
    ],
    weak: {
      reviewDue: [1, 2, 3, 4, 5].map((n) => ({ itemKey: `k${n}`, weaknessLabel: null })),
      weaknessEvents: [3, 4, 5].map((d) => ({
        category: "plurals",
        eventType: "detected",
        createdAt: `2026-11-0${d}T09:00:00.000Z`,
      })),
      mistakes: [],
    },
  },
  behindTrimmed: {
    ...base,
    goal: { ...savedGoal, targetDate: "2026-12-15" },
    completions: base.completions.slice(0, 1),
    profile: { ...base.profile, pathTrimUntil: "2026-11-25", pathOff: ["talk"] },
  },
};

describe("learning path contract fixtures", () => {
  const built = Object.fromEntries(
    Object.entries(scenarios).map(([k, v]) => [k, buildLearningPath(v)]),
  );
  it("builds a valid path for every scenario", () => {
    for (const p of Object.values(built)) expect(isPath(p)).toBe(true);
  });
  it("matches the checked-in fixture file", () => {
    if (process.env.UPDATE_PATH_FIXTURES)
      writeFileSync(FILE, `${JSON.stringify(built, null, 2)}\n`);
    expect(JSON.parse(readFileSync(FILE, "utf8"))).toEqual(JSON.parse(JSON.stringify(built)));
  });
  it("the on-track scenario really is on track, the behind one has all three choices", () => {
    expect(["on_track", "ahead"]).toContain(built.onTrack?.status);
    expect(built.behind?.status).toBe("behind");
    expect(built.behind?.recovery.map((r) => r.id)).toEqual([
      "lessons_first",
      "move_date",
      "add_minutes",
    ]);
  });
  it("the rest-day scenarios carry the learner's choice: default Sunday, Wednesday, or none", () => {
    expect(built.behind?.restDay).toBe(0);
    expect(built.restDayChosen?.restDay).toBe(3);
    expect(built.restDayChosen?.week.filter((d) => d.state === "rest").map((d) => d.label)).toEqual(
      ["Wed"],
    );
    expect(built.noRestDay?.restDay).toBe(-1);
    expect(built.noRestDay?.week.some((d) => d.state === "rest")).toBe(false);
    expect(built.noRestDay?.weekMinutes).toBe(70);
  });
  it("the video scenario carries a video in the mix and a video stop with a video ref", () => {
    const p = built.withVideo!;
    expect(p.mix.find((m) => m.type === "video")?.minutes).toBeGreaterThan(0);
    const stops = p.week.flatMap((d) => d.items).filter((i) => i.type === "video");
    expect(stops).toHaveLength(1);
    expect(stops[0].ref).toEqual({ kind: "video", id: "vid-order" });
    expect(built.behind?.mix.find((m) => m.type === "video")?.minutes).toBe(0);
  });
  it("the no-goal scenario is a suggested path: the next level, an ok date, flagged suggested", () => {
    const p = built.noGoal!;
    expect(p.goal.suggested).toBe(true);
    expect(p.goal.built).toContain("Built from your answers: travel, 10 min a day, placed at A1");
    expect(built.behind?.goal.suggested).toBe(false);
    expect(p.progress.targetLevel).toBe("A2");
    expect(p.progress.targetDate > "2027-02-01").toBe(true);
    expect(p.today.items.length).toBeGreaterThan(0);
  });
  it("the weak-spots scenario has the review item and the refresher in Today, with their reasons", () => {
    const p = built.weakSpots!;
    const weak = p.fix?.items.find((i) => i.id === "weakspots");
    expect(weak).toMatchObject({
      title: "5 items due in Review",
      minutes: 2,
      ref: { kind: "review", id: "weakspots" },
    });
    const refresher = p.fix?.items.find((i) => i.title.startsWith("Refresher"));
    expect(refresher?.title).toBe("Refresher: Plurals (A1)");
    expect(refresher?.subtitle).toBe("You mixed up plurals 3 times");
    expect(p.fix?.title).toBe("Two weak spots to tidy up");
    expect(p.today.items.some((i) => i.id === "weakspots")).toBe(false);
    expect(refresher?.ref?.kind).toBe("lesson");
    expect(p.why.filter((w) => w.source === "weak").map((w) => w.headline)).toEqual([
      "Fix your weak spots",
      "Refresher: Plurals",
    ]);
    expect(built.behind?.fix).toBeNull();
  });
  it("the behind-and-trimmed scenario really is behind and trimmed", () => {
    expect(built.behindTrimmed?.status).toBe("behind");
    expect(built.behindTrimmed?.trimmed).toBe(true);
    expect(built.behindTrimmed?.off).toEqual(["talk"]);
  });
});
