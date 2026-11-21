import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCourse, COURSES } from "../data/courses";
import {
  isLessonUnlocked,
  lessonsInLearningOrder,
  pathStates,
  unlockCeiling,
} from "./lesson-unlock";
import { learnMap, type MapUnit } from "./learn-map";

// u1 (A1): l1 l2 | u2 (A2): l1 | u3 (A1): l1  -- the array interleaves bands, as the English course does.
const raw = [
  { id: "u1l1", level: "A1" },
  { id: "u1l2", level: "A1" },
  { id: "u2l1", level: "A2" },
  { id: "u3l1", level: "A1" },
  { id: "u4l1", level: "B1" },
];
const order = lessonsInLearningOrder(raw);
const open = (done: string[], level: string | null, id: string) =>
  isLessonUnlocked(order, new Set(done), level, id);

describe("lesson-unlock rule", () => {
  it("orders band by band, keeping curriculum order inside a band", () => {
    expect(order.map((l) => l.id)).toEqual(["u1l1", "u1l2", "u3l1", "u2l1", "u4l1"]);
  });

  it("a fresh learner may start only the first lesson", () => {
    expect(open([], null, "u1l1")).toBe(true);
    expect(open([], "A1", "u1l2")).toBe(false);
    expect(open([], "A1", "u2l1")).toBe(false);
    expect(open([], "A1", "u4l1")).toBe(false);
  });

  it("completing a lesson opens exactly the next one in learning order", () => {
    expect(open(["u1l1"], "A1", "u1l2")).toBe(true);
    expect(open(["u1l1"], "A1", "u3l1")).toBe(false);
    expect(open(["u1l1", "u1l2"], "A1", "u3l1")).toBe(true);
    expect(open(["u1l1", "u1l2", "u3l1"], "A1", "u2l1")).toBe(true);
  });

  it("placement: a stored level opens its first lesson and everything before it, nothing after", () => {
    expect(open([], "A2", "u2l1")).toBe(true);
    expect(open([], "A2", "u3l1")).toBe(true);
    expect(open([], "A2", "u1l1")).toBe(true);
    expect(open([], "A2", "u4l1")).toBe(false);
    expect(open([], "B1", "u4l1")).toBe(true);
  });

  it("replay: every completed lesson stays startable, at any level", () => {
    expect(open(["u1l1", "u1l2", "u3l1", "u2l1"], "A1", "u1l1")).toBe(true);
    expect(open(["u1l1", "u1l2", "u3l1", "u2l1"], "A1", "u2l1")).toBe(true);
  });

  it("furthest completion: out-of-order history never locks the learner out of the next lesson", () => {
    // Only u3l1 done (u1l1/u1l2 skipped): the lessons before it and the next after it are all open.
    expect(open(["u3l1"], "A1", "u1l1")).toBe(true);
    expect(open(["u3l1"], "A1", "u1l2")).toBe(true);
    expect(open(["u3l1"], "A1", "u2l1")).toBe(true);
    expect(open(["u3l1"], "A1", "u4l1")).toBe(false);
  });

  it("a lesson inserted into the course later cannot lock anyone out of the lesson after their furthest", () => {
    const grown = lessonsInLearningOrder([
      ...raw.slice(0, 2),
      { id: "new1", level: "A1" },
      ...raw.slice(2),
    ]);
    const done = new Set(["u1l1", "u1l2", "u3l1"]);
    // Their furthest is u3l1 (now after new1); u2l1 is still the next and new1 is open to catch up on.
    expect(isLessonUnlocked(grown, done, "A1", "u2l1")).toBe(true);
    expect(isLessonUnlocked(grown, done, "A1", "new1")).toBe(true);
  });

  it("a lesson that is not in the course is never unlocked", () => {
    expect(open([], "C1", "nope")).toBe(false);
  });

  it("an unknown or missing level gives no floor", () => {
    expect(unlockCeiling(order, new Set(), null)).toBe(0);
    expect(unlockCeiling(order, new Set(), undefined)).toBe(0);
  });
});

describe("the Learn map and the server rule cannot drift", () => {
  for (const course of COURSES.map((c) => c.id)) {
    it(`${course}: the map's "next" lesson is always startable, from every learner state`, () => {
      const { curriculum } = getCourse(course);
      const learning = lessonsInLearningOrder(
        curriculum.flatMap((u) => u.lessons.map((l) => ({ id: l.id, level: u.level }))),
      );
      for (const level of ["A1", "A2", "B1", "B2", "C1"] as const) {
        const units = curriculum.filter((u) => u.level === level);
        const mapUnits: MapUnit[] = units.map((u) => ({
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
        // A learner who finished the first k lessons of the level on screen (k = every count that matters).
        const ids = units.flatMap((u) => u.lessons.map((l) => l.id));
        for (const k of [0, 1, 2, Math.floor(ids.length / 2), ids.length - 1, ids.length]) {
          const done = new Set(ids.slice(0, k));
          const next = learnMap(mapUnits, done)?.next;
          if (next && !done.has(next.lessonId)) {
            expect(isLessonUnlocked(learning, done, level, next.lessonId)).toBe(true);
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
