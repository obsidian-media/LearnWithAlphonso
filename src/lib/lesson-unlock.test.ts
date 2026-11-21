import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCourse, COURSES } from "../data/courses";
import type { Level } from "../data/levels";
import {
  firstUndoneInCurriculumOrder,
  isLessonUnlocked,
  lessonsInLearningOrder,
  nextStartableLessonId,
  pathStates,
  unlockedLessonIds,
} from "./lesson-unlock";
import { currentUnitOf, foldLearn, type FoldUnit } from "./learn-fold";
import { learnMap, type MapUnit } from "./learn-map";
import { buildLearningPath, type PathData } from "./learning-path-data";

// Curriculum (array) order, interleaving bands as the English course does:
//   u1l1 A1, u1l2 A1, u2l1 A2, u3l1 A1, u4l1 B1
const raw = [
  { id: "u1l1", level: "A1" },
  { id: "u1l2", level: "A1" },
  { id: "u2l1", level: "A2" },
  { id: "u3l1", level: "A1" },
  { id: "u4l1", level: "B1" },
];
const open = (done: string[], level: string | null | undefined, id: string) =>
  isLessonUnlocked(raw, new Set(done), level, id);

describe("lesson-unlock rule", () => {
  it("orders band by band, keeping curriculum order inside a band", () => {
    expect(lessonsInLearningOrder(raw).map((l) => l.id)).toEqual([
      "u1l1",
      "u1l2",
      "u3l1",
      "u2l1",
      "u4l1",
    ]);
  });

  it("a fresh learner may start only the first lesson", () => {
    expect(open([], null, "u1l1")).toBe(true);
    expect(open([], "A1", "u1l2")).toBe(false);
    expect(open([], "A1", "u2l1")).toBe(false);
    expect(open([], "A1", "u4l1")).toBe(false);
  });

  it("completing a lesson opens the next one in learning order", () => {
    expect(open(["u1l1"], "A1", "u1l2")).toBe(true);
    expect(open(["u1l1"], "A1", "u3l1")).toBe(false);
    expect(open(["u1l1", "u1l2"], "A1", "u3l1")).toBe(true);
    expect(open(["u1l1", "u1l2", "u3l1"], "A1", "u2l1")).toBe(true);
    expect(open(["u1l1", "u1l2", "u3l1"], "A1", "u4l1")).toBe(false);
  });

  it("placement: a stored level opens its first lesson and everything before it, nothing after", () => {
    expect(open([], "A2", "u2l1")).toBe(true);
    expect(open([], "A2", "u3l1")).toBe(true);
    expect(open([], "A2", "u1l1")).toBe(true);
    expect(open([], "A2", "u4l1")).toBe(false);
    expect(open([], "B1", "u4l1")).toBe(true);
  });

  it("replay: every completed lesson stays startable", () => {
    const all = ["u1l1", "u1l2", "u3l1", "u2l1"];
    for (const id of all) expect(open(all, "A1", id)).toBe(true);
  });

  it("furthest completion: only completions that were themselves startable move the ceiling", () => {
    // u3l1 done with u1l1/u1l2 skipped (it was not startable then): it stays open to replay, but it opens nothing.
    expect(open(["u3l1"], "A1", "u3l1")).toBe(true);
    expect(open(["u3l1"], "A1", "u1l1")).toBe(true);
    expect(open(["u3l1"], "A1", "u1l2")).toBe(false);
    expect(open(["u3l1"], "A1", "u2l1")).toBe(false);
    // A normal run opens the next one.
    expect(open(["u1l1", "u1l2"], "A1", "u3l1")).toBe(true);
  });

  it("a lesson inserted into the course later never hides the lesson the map offers", () => {
    const grown = [...raw.slice(0, 2), { id: "new1", level: "A1" }, ...raw.slice(2)];
    const done = new Set(["u1l1", "u1l2", "u3l1"]);
    // The map's next is the new lesson (first not done), and the one they already finished replays.
    expect(nextStartableLessonId(grown, done, "A1")).toBe("new1");
    expect(isLessonUnlocked(grown, done, "A1", "new1")).toBe(true);
    expect(isLessonUnlocked(grown, done, "A1", "u3l1")).toBe(true);
  });

  it("the first lesson not done in curriculum order (the installed apps' place) stays startable, and only that one", () => {
    // Finished u1l1 and u1l2: curriculum order says u2l1 (A2) is next, learning order says u3l1 (A1).
    expect(firstUndoneInCurriculumOrder(raw, new Set(["u1l1", "u1l2"]))).toBe("u2l1");
    expect(open(["u1l1", "u1l2"], "A1", "u2l1")).toBe(true);
    expect(open(["u1l1", "u1l2"], "A1", "u3l1")).toBe(true);
    expect(open(["u1l1", "u1l2"], "A1", "u4l1")).toBe(false);
  });

  it("a missing progress row (no stored level) opens exactly what A1 does, as the Path's default level assumes", () => {
    for (const done of [[], ["u1l1"], ["u1l1", "u1l2"]]) {
      expect([...unlockedLessonIds(raw, new Set(done), null)].sort()).toEqual(
        [...unlockedLessonIds(raw, new Set(done), "A1")].sort(),
      );
    }
  });

  it("a lesson that is not in the course is never unlocked", () => {
    expect(open([], "C1", "nope")).toBe(false);
  });

  it("an unknown or missing level gives no floor", () => {
    expect([...unlockedLessonIds(raw, new Set(), null)].sort()).toEqual(["u1l1"]);
    expect(open([], undefined, "u1l2")).toBe(false);
  });

  it("nextStartableLessonId is the map's next and always startable", () => {
    expect(nextStartableLessonId(raw, new Set(), "A1")).toBe("u1l1");
    expect(nextStartableLessonId(raw, new Set(["u1l1", "u1l2", "u3l1"]), "A1")).toBe("u2l1");
    expect(nextStartableLessonId(raw, new Set(), "A2")).toBe("u2l1");
    expect(nextStartableLessonId(raw, new Set(raw.map((l) => l.id)), "A1")).toBeNull();
  });
});

/** A small seeded generator, so a failure is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const LEVELS: Level[] = ["A1", "A2", "B1", "B2", "C1"];

/** Many learner states for one course: prefixes in learning order, prefixes in curriculum order, random subsets. */
function completionSets(rawLessons: { id: string }[], learning: { id: string }[]): Set<string>[] {
  const sets: Set<string>[] = [new Set()];
  const rand = rng(42);
  const n = rawLessons.length;
  for (let i = 0; i < 25; i++) {
    const k = Math.floor(rand() * (n + 1));
    sets.push(new Set(learning.slice(0, k).map((l) => l.id)));
    sets.push(new Set(rawLessons.slice(0, k).map((l) => l.id)));
  }
  for (let i = 0; i < 25; i++) {
    const density = rand();
    sets.push(new Set(rawLessons.filter(() => rand() < density).map((l) => l.id)));
  }
  sets.push(new Set(rawLessons.map((l) => l.id)));
  return sets;
}

function lessonItems(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => lessonItems(n, out));
  else if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    if (o.type === "lesson" && typeof o.id === "string") out.push(o.id);
    Object.values(o).forEach((v) => lessonItems(v, out));
  }
  return out;
}

describe("the curriculum-order allowance cannot ratchet", () => {
  for (const course of ["en", "fr", "es"] as const) {
    it(`${course}: a learner who always takes the curriculum-order next never has more open than strict + that one + replays`, () => {
      const { curriculum } = getCourse(course);
      const rawLessons = curriculum.flatMap((u) =>
        u.lessons.map((l) => ({ id: l.id, level: u.level })),
      );
      const learning = lessonsInLearningOrder(rawLessons);
      for (const level of ["A1", "A2"]) {
        const floor = Math.max(
          0,
          learning.findIndex((l) => l.level === level),
        );
        const done = new Set<string>();
        for (const next of rawLessons) {
          // Independent model: the open prefix ends at the first lesson not done at or after the level's floor, plus the curriculum-order next, plus whatever is already done.
          const firstUndone = learning.findIndex((l, i) => i >= floor && !done.has(l.id));
          const prefixEnd = firstUndone === -1 ? learning.length - 1 : firstUndone;
          const model = new Set([
            ...learning.slice(0, prefixEnd + 1).map((l) => l.id),
            ...done,
            next.id,
          ]);
          const got = unlockedLessonIds(rawLessons, done, level);
          expect(got.has(next.id)).toBe(true);
          for (const id of got) expect(model.has(id)).toBe(true);
          done.add(next.id);
        }
      }
    });
  }
});

describe("every lesson any Learn surface offers is startable (the screens cannot offer what the server refuses)", () => {
  for (const course of COURSES.map((c) => c.id)) {
    const { curriculum } = getCourse(course);
    const rawLessons = curriculum.flatMap((u) =>
      u.lessons.map((l) => ({ id: l.id, level: u.level })),
    );
    const learning = lessonsInLearningOrder(rawLessons);

    it(`${course}: map next, where-you-are, continue, fold rows and the locked page's link`, () => {
      // What learn.tsx builds: units in learning order for the course-wide place.
      const foldUnits: FoldUnit[] = lessonsInLearningOrder(curriculum).map((u) => ({
        id: u.id,
        eyebrow: u.eyebrow,
        title: u.title,
        lessonIds: u.lessons.map((l) => l.id),
      }));

      for (const done of completionSets(rawLessons, learning)) {
        for (const level of LEVELS) {
          const allowed = unlockedLessonIds(rawLessons, done, level, { curriculumNext: false });
          const offered: string[] = [];

          // The climbing map for the level on screen (the stored level).
          const mapUnits: MapUnit[] = curriculum
            .filter((u) => u.level === level)
            .map((u) => ({
              id: u.id,
              title: u.title,
              lessons: u.lessons.map((l) => ({
                id: l.id,
                title: l.title,
                subtitle: l.subtitle,
                questionTypes: ["mc"],
                wordCount: 1,
              })),
            }));
          const next = learnMap(mapUnits, done)?.next;
          if (next) offered.push(next.lessonId);

          // The learner's place: the active Learn row and the Continue lesson.
          const here = currentUnitOf(foldUnits, done);
          if (here) offered.push(here.lessonId);

          // The fold's current row for this level: its unit is the one "here" lives in, when it lives in this level.
          const levelFold = foldUnits.filter(
            (fu) => curriculum.find((u) => u.id === fu.id)?.level === level,
          );
          for (const row of foldLearn(levelFold, done)) {
            if (row.kind === "unit" && row.state === "current" && here?.unitId === row.unitId) {
              offered.push(here.lessonId);
            }
          }

          // Where "Go to your next lesson" points on the locked page.
          const nextId = nextStartableLessonId(rawLessons, done, level);
          if (nextId) offered.push(nextId);

          for (const id of offered) expect(allowed.has(id)).toBe(true);
        }
      }
    });

    it(`${course}: Path lesson candidates are all startable`, () => {
      const sets = completionSets(rawLessons, learning);
      for (const done of sets) {
        for (const level of LEVELS) {
          const data: PathData = {
            course,
            now: new Date("2026-11-11T10:00:00Z"),
            currentLevel: level,
            startableOnly: true,
            goal: {
              targetLevel: "C1",
              targetDate: "2030-06-01",
              createdAt: "2026-10-01T00:00:00.000Z",
            },
            completions: [...done].map((lessonId) => ({
              lessonId,
              completedAt: "2026-11-01T08:00:00.000Z",
            })),
            learningDays: [],
            skillDays: [],
            episodes: [],
            listen: [],
            videos: [],
            videoWatches: [],
            calls: [],
            stars: [],
            profile: { showFlag: false, goal: "travel", interests: [], dailyMinutes: 10 },
          };
          const plan = buildLearningPath(data);
          if (level === "A1") expect(plan).not.toBeNull();
          if (!plan) continue;
          const allowed = unlockedLessonIds(rawLessons, done, level, { curriculumNext: false });
          for (const id of lessonItems(plan)) {
            if (!done.has(id)) expect(allowed.has(id)).toBe(true);
          }
        }
      }
    });
  }

  it("the Learn map states are the shared pathStates", () => {
    expect(pathStates(["a", "b", "c"], new Set(["a"]))).toEqual(["done", "next", "locked"]);
  });
});

describe("the Edge Function copy", () => {
  it("is byte-identical to the web source", () => {
    const web = fs.readFileSync(path.resolve(import.meta.dirname, "lesson-unlock.ts"), "utf8");
    const edge = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../supabase/functions/_shared/lesson-unlock.ts"),
      "utf8",
    );
    expect(edge).toBe(web);
  });
});
