import { describe, expect, it } from "vitest";
import {
  currentUnitOf,
  foldLearn,
  roomArtFor,
  ROOM_ART,
  runLabel,
  type FoldUnit,
} from "./learn-fold";

const mk = (n: number): FoldUnit[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `u${i + 1}`,
    eyebrow: `Unit ${i + 1}`,
    title: `T${i + 1}`,
    lessonIds: [`u${i + 1}l1`, `u${i + 1}l2`],
  }));
const all = (...us: number[]) => new Set(us.flatMap((u) => [`u${u}l1`, `u${u}l2`]));

describe("foldLearn", () => {
  it("folds an unbroken done run into one row, opens the current unit, folds the rest", () => {
    const rows = foldLearn(mk(6), all(1, 2, 3));
    expect(rows.map((r) => r.kind + (r.kind === "unit" ? ":" + r.state : ""))).toEqual([
      "done-run",
      "unit:current",
      "unit:ahead",
      "unit:ahead",
    ]);
    const run = rows[0];
    if (run.kind !== "done-run") throw new Error();
    expect(run.unitIds).toEqual(["u1", "u2", "u3"]);
    expect(runLabel(run)).toBe("Units 1-3");
    expect([run.done, run.total]).toEqual([6, 6]);
  });
  it("a partly-done unit is the current one, never folded", () => {
    const rows = foldLearn(mk(3), new Set(["u1l1", "u1l2", "u2l1"]));
    expect(rows[1]).toMatchObject({ kind: "unit", state: "current", done: 1, total: 2 });
  });
  it("a fresh learner has no done run and exactly one current unit", () => {
    const rows = foldLearn(mk(4), new Set());
    expect(rows.filter((r) => r.kind === "done-run")).toHaveLength(0);
    expect(rows.filter((r) => r.kind === "unit" && r.state === "current")).toHaveLength(1);
  });
  it("everything done folds to a single row with no current unit", () => {
    const rows = foldLearn(mk(3), all(1, 2, 3));
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("done-run");
  });
  it("an empty unit is never counted as done", () => {
    const rows = foldLearn([{ id: "x", eyebrow: "Unit 1", title: "x", lessonIds: [] }], new Set());
    expect(rows[0].kind).toBe("unit");
  });
  it("a single done unit labels as just its name", () => {
    const r = foldLearn(mk(2), all(1))[0];
    if (r.kind !== "done-run") throw new Error();
    expect(runLabel(r)).toBe("Unit 1");
  });
});

describe("currentUnitOf", () => {
  it("is the first undone lesson, 1-based within the whole course", () => {
    expect(currentUnitOf(mk(5), all(1, 2))).toEqual({
      index: 3,
      count: 5,
      unitId: "u3",
      lessonId: "u3l1",
    });
  });
  it("is null when the course is finished", () => {
    expect(currentUnitOf(mk(2), all(1, 2))).toBeNull();
  });
});

describe("roomArtFor", () => {
  it("wraps and never throws for any index", () => {
    expect(roomArtFor(0)).toBe(ROOM_ART[0]);
    expect(roomArtFor(ROOM_ART.length)).toBe(ROOM_ART[0]);
    expect(roomArtFor(-1)).toBe(ROOM_ART[ROOM_ART.length - 1]);
  });
});
