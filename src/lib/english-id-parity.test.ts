import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectCourseIds, diffIds, packLineStats } from "./english-id-parity";
import type { Course } from "@/data/courses";

describe("diffIds", () => {
  it("reports no drift for identical id sets", () => {
    expect(diffIds(["a:1", "b:2"], ["a:1", "b:2"])).toEqual({ added: [], removed: [] });
  });

  it("reports drift when a line add shifts ids (Review Focus #1)", () => {
    const baseline = ["p1:q0", "p1:q1", "p1:q2"];
    const current = ["p1:q0", "p1:q1", "p1:q2", "p1:q3"];
    expect(diffIds(baseline, current)).toEqual({ added: ["p1:q3"], removed: [] });
  });

  it("reports drift when a line removal drops ids", () => {
    expect(diffIds(["p1:q0", "p1:q1"], ["p1:q0"])).toEqual({ added: [], removed: ["p1:q1"] });
  });
});

const COURSES: { course: Course; baseline: string; samplePackId: string }[] = [
  { course: "en", baseline: "english-ids.json", samplePackId: "a1p1" },
  { course: "fr", baseline: "french-ids.json", samplePackId: "fra1p1" },
];

describe.each(COURSES)("course $course", ({ course, baseline, samplePackId }) => {
  it("collectCourseIds returns sorted, unique lessonId:questionId keys", () => {
    const ids = collectCourseIds(course);
    expect(ids.length).toBeGreaterThan(2000);
    expect([...new Set(ids)].length).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  it("packLineStats counts lines per pack and flags malformed ones (Review Focus #3)", () => {
    const stats = packLineStats(course);
    const packIds = Object.keys(stats);
    expect(packIds).toContain(samplePackId);
    expect(stats[samplePackId]!.lines).toBeGreaterThan(0);
    // A stray extra "|" silently drops content in packQuestions' split.
    for (const [packId, s] of Object.entries(stats)) {
      expect(s.malformed, `pack ${packId} has malformed lines`).toEqual([]);
    }
  });

  it("packLineStats: every pack has exactly 25 lines (the generator's expected pack size)", () => {
    // A short pack silently produces short lessons with no test failure
    // otherwise -- spec section 6.3 item 2.
    const stats = packLineStats(course);
    for (const [packId, s] of Object.entries(stats)) {
      expect(s.lines, `pack ${packId} has ${s.lines} lines, expected 25`).toBe(25);
    }
  });

  it("has not added or removed any question id against the committed baseline", () => {
    const baselinePath = path.resolve(import.meta.dirname, "../../.audit-baseline", baseline);
    const baselineIds = JSON.parse(fs.readFileSync(baselinePath, "utf8")) as string[];
    const { added, removed } = diffIds(baselineIds, collectCourseIds(course));
    expect({ added, removed }).toEqual({ added: [], removed: [] });
  });
});
