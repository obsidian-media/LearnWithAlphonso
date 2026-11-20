import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import timing from "../data/lesson-timing.json";
import { estimateLessonMinutes } from "./lesson-time";
import { learnMap, mapPoint, type LearnMap, type MapUnit } from "./learn-map";

/**
 * Replays shared/learn-map.json. The Kit (LearnMapTests) and the Android core (LearnMapTest) replay the same file, so
 * a port that drifts from the others fails in its own suite.
 */
type Case = { name: string; completed: string[]; unitId?: string; expect: LearnMap | null };
const fixtures = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "../../shared/learn-map.json"), "utf8"),
) as {
  timing: typeof timing;
  units: MapUnit[];
  cases: Case[];
  noUnits: { completed: string[]; expect: null };
  points: { index: number; slots: number; x: number; y: number }[];
};

/** The map with every coordinate rounded, so 0.69 and 0.6900000000000001 compare equal (the fixture is rounded). */
const round = (m: LearnMap | null) =>
  m && {
    ...m,
    strip: { ...m.strip, progress: +m.strip.progress.toFixed(6) },
    nodes: m.nodes.map((n) => ({ ...n, x: +n.x.toFixed(6), y: +n.y.toFixed(6) })),
    chest: { ...m.chest, x: +m.chest.x.toFixed(6), y: +m.chest.y.toFixed(6) },
  };

describe("the Learn climbing map (shared/learn-map.json)", () => {
  it.each(fixtures.cases)("$name", (c) => {
    const map = learnMap(fixtures.units, new Set(c.completed), {
      unitId: c.unitId,
      timing: fixtures.timing,
    });
    expect(round(map)).toEqual(c.expect);
  });

  it("a level with no units gives no map", () => {
    expect(learnMap([], new Set(fixtures.noUnits.completed))).toBe(fixtures.noUnits.expect);
  });

  it.each(fixtures.points)("slot $index of $slots sits at ($x, $y)", (p) => {
    const at = mapPoint(p.index, p.slots);
    expect(at.x).toBeCloseTo(p.x, 9);
    expect(at.y).toBeCloseTo(p.y, 9);
  });

  it("the fixture's timing is the shipped one, and the start sheet uses lesson start's estimate", () => {
    const { $comment: _, ...shipped } = timing as typeof timing & { $comment?: string };
    expect(fixtures.timing).toEqual(shipped);
    // Without a table the map uses the shipped one, the same numbers lesson start shows.
    const map = learnMap(fixtures.units, new Set())!;
    const first = fixtures.units[0]!.lessons[0]!;
    expect(map.next!.minutes).toBe(
      estimateLessonMinutes(
        first.questionTypes.map((type) => ({ type }) as never),
        first.wordCount,
      ),
    );
  });

  it("the climb always rises: each node sits above the one before, the chest highest", () => {
    for (const slots of [2, 4, 6, 12]) {
      const ys = Array.from({ length: slots }, (_, i) => mapPoint(i, slots).y);
      for (let i = 1; i < ys.length; i++) expect(ys[i]!).toBeLessThan(ys[i - 1]!);
      expect(mapPoint(slots - 1, slots)).toEqual({ x: 0.5, y: 0.06 });
    }
  });
});
