import { describe, expect, it } from "vitest";
import {
  PLACEMENT_ORDER,
  PLACEMENT_QUESTIONS,
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
