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

const COURSES: {
  course: Course;
  baseline: string;
  samplePackId: string;
  // Spanish deliberately has non-uniform pack lengths (10/15/20/25 lines) --
  // docs/superpowers/specs/2026-09-25-spanish-content-audit-design.md §2's
  // recorded 2026-09-25 decision: "accept, document, do not fill" 83 of its
  // 130 packs rather than author ~710 new lines under audit cover. The
  // uniform-25-lines test below only applies where that's actually the
  // expectation.
  expectUniformPackLength: boolean;
}[] = [
  {
    course: "en",
    baseline: "english-ids.json",
    samplePackId: "a1p1",
    expectUniformPackLength: true,
  },
  {
    course: "fr",
    baseline: "french-ids.json",
    samplePackId: "fra1p1",
    expectUniformPackLength: true,
  },
  {
    course: "es",
    baseline: "spanish-ids.json",
    samplePackId: "esa1p1",
    expectUniformPackLength: false,
  },
];

describe.each(COURSES)(
  "course $course",
  ({ course, baseline, samplePackId, expectUniformPackLength }) => {
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

    if (expectUniformPackLength) {
      it("packLineStats: every pack has exactly 25 lines (the generator's expected pack size)", () => {
        // A short pack silently produces short lessons with no test failure
        // otherwise -- spec section 6.3 item 2.
        const stats = packLineStats(course);
        for (const [packId, s] of Object.entries(stats)) {
          expect(s.lines, `pack ${packId} has ${s.lines} lines, expected 25`).toBe(25);
        }
      });
    } else {
      it("packLineStats: pack-length distribution matches the documented 2026-09-25 baseline (83 short packs, accepted not fixed)", () => {
        // Not a "must be 25" assertion -- see the recorded decision at COURSES'
        // definition above. This is a drift guard instead: it pins today's
        // exact distribution so a future edit that accidentally shortens a
        // pack further (e.g. while fixing a §3 duplicate by deleting rather
        // than replacing a line) is caught, the same way a baseline number
        // catches drift elsewhere in this repo. Update this baseline only as
        // a deliberate part of the §2 short-pack decision changing, never as
        // a side effect of an unrelated fix.
        const stats = packLineStats(course);
        const distribution: Record<number, number> = {};
        for (const s of Object.values(stats)) {
          distribution[s.lines] = (distribution[s.lines] ?? 0) + 1;
        }
        expect(distribution).toEqual({ 10: 3, 15: 53, 20: 27, 25: 47 });
      });
    }

    it("has not added or removed any question id against the committed baseline", () => {
      const baselinePath = path.resolve(import.meta.dirname, "../../.audit-baseline", baseline);
      const baselineIds = JSON.parse(fs.readFileSync(baselinePath, "utf8")) as string[];
      const { added, removed } = diffIds(baselineIds, collectCourseIds(course));
      expect({ added, removed }).toEqual({ added: [], removed: [] });
    });
  },
);
