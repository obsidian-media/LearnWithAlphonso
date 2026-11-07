import { describe, expect, it } from "vitest";
import { skillScores, type SkillDayRow } from "./profile-data";
import { MIN_SKILL_ANSWERS, radarModel, radarPoint, radarPolygon } from "./skills-radar";

const today = "2026-11-06";
const row = (skill: string, right: number, total: number): SkillDayRow => ({
  day: "2026-11-05",
  skill,
  right,
  total,
});
const model = (rows: SkillDayRow[]) => radarModel(skillScores(rows, today));

describe("radarModel", () => {
  it("is not ready with no answers: five unscored skills, nothing invented", () => {
    const m = model([]);
    expect(m.ready).toBe(false);
    expect(m.skills.map((s) => s.pct)).toEqual([null, null, null, null, null]);
  });

  it("a skill under the minimum answers is unscored and says how many more it needs", () => {
    const m = model([row("listening", 4, MIN_SKILL_ANSWERS - 1)]);
    const s = m.skills.find((x) => x.skill === "listening")!;
    expect(s.pct).toBeNull();
    expect(s.needed).toBe(1);
  });

  it("needs three scored skills, then names the lowest", () => {
    const two = model([row("listening", 9, 10), row("grammar", 4, 10)]);
    expect(two.ready).toBe(false);
    const three = model([row("listening", 9, 10), row("grammar", 4, 10), row("reading", 8, 10)]);
    expect(three.ready).toBe(true);
    if (three.ready) expect(three.lowest.skill).toBe("grammar");
  });
});

describe("radar geometry", () => {
  it("axis 0 points straight up and the polygon has one vertex per scored skill", () => {
    expect(radarPoint(0, 5, 100, 150)).toEqual([150, 50]);
    const m = model([row("listening", 10, 10), row("grammar", 5, 10), row("reading", 10, 10)]);
    expect(radarPolygon(m.skills, 100, 150).split(" ")).toHaveLength(3);
    // A 100 score sits on the rim of its axis.
    expect(radarPolygon(m.skills, 100, 150).split(" ")[0]).toBe("150,50");
  });
});

describe("radar bounds", () => {
  it("never plots outside the chart, even for rows with more right answers than total", () => {
    const m = model([row("listening", 30, 10), row("grammar", 5, 10), row("reading", 10, 10)]);
    expect(m.skills.find((s) => s.skill === "listening")?.pct).toBe(100);
  });
});
