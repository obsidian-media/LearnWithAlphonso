import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The Skills radar and the goal rings on iOS. The app target only compiles in CI, so these pin the source.
const norm = (s: string) => s.replace(/\r\n/g, "\n");
const app = (p: string) => norm(readFileSync(`ios/LearnWithAlphonso/Sources/${p}`, "utf8"));
const kit = (p: string) =>
  norm(readFileSync(`ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/${p}`, "utf8"));

const view = app("ProfileOverviewView.swift");
const radar = kit("SkillsRadar.swift");
const web = norm(readFileSync("src/lib/skills-radar.ts", "utf8"));

describe("iOS Skills radar", () => {
  it("uses the same thresholds as the web rules", () => {
    const n = (re: RegExp, s: string) => Number(re.exec(s)?.[1]);
    expect(n(/MIN_SKILL_ANSWERS = (\d+)/, web)).toBe(n(/minSkillAnswers = (\d+)/, radar));
    expect(n(/MIN_SKILLS_FOR_RADAR = (\d+)/, web)).toBe(n(/minSkillsForRadar = (\d+)/, radar));
  });

  it("is drawn from the Kit model with design tokens only, and the placeholder is gone", () => {
    const section = view.slice(
      view.indexOf("struct ProfileSkillsSection"),
      view.indexOf("// MARK: Records"),
    );
    expect(section).toContain("SkillsRadar.radarPolygon");
    expect(section).not.toMatch(
      /Color\(|\.system\(size|Color\.(red|blue|green|orange|black|white)|#[0-9a-fA-F]{6}/,
    );
    expect(section).toMatch(/ds\.choice/);
    expect(app("ProfileTabViews.swift")).not.toContain("ProfileSkillsSlot");
  });

  it("says how many more answers a skill needs, in the web's words", () => {
    expect(view).toContain("more \\(plural(s.needed");
    expect(view).toContain("to score (");
    expect(view).toContain("Practise it to lift your shape.");
  });

  it("measures the week in minutes against the learner's goal, with the web's copy", () => {
    expect(view).toContain("ProfileMath.goalRings");
    expect(view).toContain("Goal: \\(minutes) learning minutes a day");
    expect(view).toContain(
      "Pick a daily time in Edit your answers to measure your days in minutes.",
    );
    expect(app("ProfileHubView.swift")).toContain("dailyGoalMinutes: dailyMinutes");
  });

  it("shows Words mastered and the league rank with the week end", () => {
    expect(view).toContain("words mastered");
    expect(view).toContain("ProfileMath.leagueWeekEnds");
  });
});
