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

const base: PathData = {
  course: "en",
  now: NOW,
  currentLevel: "A1",
  goal: { targetLevel: "A2", targetDate: "2027-06-01", createdAt: "2026-10-01T00:00:00.000Z" },
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
    { id: "ep-coffee", folder: "a1", slug: "ordering-coffee-v2", title: "Ordering coffee", durationSeconds: 173, levelId: "A1" },
  ],
  listen: [],
  calls: [],
  stars: [],
  profile: { showFlag: false, goal: "travel", interests: ["food"], dailyMinutes: 10 },
};

const scenarios: Record<string, PathData> = {
  onTrack: { ...base, goal: { ...base.goal, targetDate: "2028-06-01" } },
  behind: base,
  behindTrimmed: {
    ...base,
    goal: { ...base.goal, targetDate: "2026-12-15" },
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
    if (process.env.UPDATE_PATH_FIXTURES) writeFileSync(FILE, `${JSON.stringify(built, null, 2)}\n`);
    expect(JSON.parse(readFileSync(FILE, "utf8"))).toEqual(JSON.parse(JSON.stringify(built)));
  });
  it("the on-track scenario really is on track, the behind one has all three choices", () => {
    expect(["on_track", "ahead"]).toContain(built.onTrack?.status);
    expect(built.behind?.status).toBe("behind");
    expect(built.behind?.recovery.map((r) => r.id)).toEqual(["lessons_first", "move_date", "add_minutes"]);
  });
  it("the behind-and-trimmed scenario really is behind and trimmed", () => {
    expect(built.behindTrimmed?.status).toBe("behind");
    expect(built.behindTrimmed?.trimmed).toBe(true);
    expect(built.behindTrimmed?.off).toEqual(["talk"]);
  });
});
