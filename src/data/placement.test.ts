import { describe, expect, it } from "vitest";
import {
  PLACEMENT_ORDER,
  PLACEMENT_QUESTIONS,
  groupByBand,
  nextAdaptiveBand,
  pickPlacementSet,
  scorePlacement,
} from "./placement";
import type { Level } from "./levels";

describe("pickPlacementSet", () => {
  it("picks exactly 3 questions per band, in band order", () => {
    const set = pickPlacementSet();
    expect(set.length).toBe(PLACEMENT_ORDER.length * 3);
    expect(set.map((q) => q.level)).toEqual(PLACEMENT_ORDER.flatMap((lvl) => [lvl, lvl, lvl]));
  });

  it("only picks questions that exist in the given pool", () => {
    const set = pickPlacementSet(PLACEMENT_QUESTIONS);
    for (const q of set) {
      expect(PLACEMENT_QUESTIONS).toContain(q);
    }
  });

  it("never picks duplicate questions", () => {
    const set = pickPlacementSet();
    expect(new Set(set.map((q) => q.id)).size).toBe(set.length);
  });

  it("handles a band with fewer than 3 candidates by taking all of them", () => {
    const pool = PLACEMENT_QUESTIONS.filter((q) => q.level === "A1").slice(0, 2);
    const set = pickPlacementSet(pool);
    expect(set.length).toBe(2);
  });
});

describe("scorePlacement", () => {
  const zero: Record<Level, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 };

  it("places at A1 with no passed bands when nothing is correct", () => {
    expect(scorePlacement(zero)).toEqual({ level: "A1", passed: [] });
  });

  it("requires at least 2/3 correct to pass a band", () => {
    expect(scorePlacement({ ...zero, A1: 1 })).toEqual({ level: "A1", passed: [] });
    expect(scorePlacement({ ...zero, A1: 2 })).toEqual({ level: "A2", passed: ["A1"] });
  });

  it("stops at the first band not passed", () => {
    expect(scorePlacement({ ...zero, A1: 3, A2: 3, B1: 1 })).toEqual({
      level: "B1",
      passed: ["A1", "A2"],
    });
  });

  it("caps at C1 when every band is passed", () => {
    expect(scorePlacement({ A1: 3, A2: 3, B1: 3, B2: 3, C1: 3 })).toEqual({
      level: "C1",
      passed: ["A1", "A2", "B1", "B2", "C1"],
    });
  });

  it("treats a missing level entry as 0 correct", () => {
    expect(scorePlacement({} as Record<Level, number>)).toEqual({ level: "A1", passed: [] });
  });
});

describe("groupByBand", () => {
  it("groups a flat set by level, keeping every band's key even when empty", () => {
    const grouped = groupByBand(pickPlacementSet());
    expect(Object.keys(grouped).sort()).toEqual([...PLACEMENT_ORDER].sort());
    for (const lvl of PLACEMENT_ORDER) {
      expect(grouped[lvl].every((q) => q.level === lvl)).toBe(true);
    }
  });

  it("returns an empty array for a band with no candidates", () => {
    const grouped = groupByBand(PLACEMENT_QUESTIONS.filter((q) => q.level === "A1"));
    expect(grouped.B1).toEqual([]);
  });
});

describe("nextAdaptiveBand", () => {
  // A uniform 3-per-band pool covering all 5 bands, mirroring real course shape.
  const fullPool = groupByBand(pickPlacementSet());
  // Only A1 has content -- mirrors a thin/mocked pool.
  const a1OnlyPool = groupByBand(PLACEMENT_QUESTIONS.filter((q) => q.level === "A1").slice(0, 3));

  it("stops immediately when every question in the band is wrong", () => {
    expect(nextAdaptiveBand(fullPool, 0, 0)).toEqual({ stop: true, skipped: null, nextIdx: 0 });
  });

  it("stops immediately when the band has no candidates at all", () => {
    const emptyPool = groupByBand([]);
    expect(nextAdaptiveBand(emptyPool, 0, 0)).toEqual({ stop: true, skipped: null, nextIdx: 0 });
  });

  it("advances one band normally on partial credit", () => {
    expect(nextAdaptiveBand(fullPool, 0, 1)).toEqual({ stop: false, skipped: null, nextIdx: 1 });
    expect(nextAdaptiveBand(fullPool, 0, 2)).toEqual({ stop: false, skipped: null, nextIdx: 1 });
  });

  it("skips the next band on a perfect score when a real band lies two steps ahead", () => {
    expect(nextAdaptiveBand(fullPool, 0, 3)).toEqual({ stop: false, skipped: "A2", nextIdx: 2 });
    expect(nextAdaptiveBand(fullPool, 2, 3)).toEqual({ stop: false, skipped: "B2", nextIdx: 4 });
  });

  it("never skips into the final band -- C1 is only ever earned by a real question", () => {
    // B2 (idx 3) acing would land on idx 5, past the end -- no skip.
    expect(nextAdaptiveBand(fullPool, 3, 3)).toEqual({ stop: false, skipped: null, nextIdx: 4 });
  });

  it("does not stop or skip differently at the true final band, C1", () => {
    expect(nextAdaptiveBand(fullPool, 4, 3)).toEqual({ stop: false, skipped: null, nextIdx: 5 });
    expect(nextAdaptiveBand(fullPool, 4, 0)).toEqual({ stop: true, skipped: null, nextIdx: 4 });
  });

  it("declines to skip when the landing band has no real content, even on a perfect score", () => {
    // A2..C1 are all empty in this pool, so acing A1 must not grant free
    // credit for A2 -- see placement.tsx's use of this guard.
    expect(nextAdaptiveBand(a1OnlyPool, 0, 3)).toEqual({ stop: false, skipped: null, nextIdx: 1 });
  });
});
