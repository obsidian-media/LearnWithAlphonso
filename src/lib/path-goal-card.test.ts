import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fixtures from "./learning-path.fixtures.json";
import { formatGoalDate, pathGoalCard, pathGoalChips } from "./path-goal-card";
import type { LearningPath } from "./path-plan";

const path = (key: keyof typeof fixtures) => fixtures[key] as unknown as LearningPath;

describe("the goal card on MY PATH", () => {
  it("prints the target, the lessons a week and the status words from the planner's numbers", () => {
    expect(pathGoalCard(path("behind"))).toEqual({
      hasGoal: true,
      kicker: "My goal",
      headline: "A2 by 1 Jun 2027",
      detail: "9 lessons a week · A bit behind",
    });
    expect(pathGoalCard(path("onTrack"))).toMatchObject({
      headline: "A2 by 1 Jun 2028",
      detail: "4 lessons a week · Ahead of plan",
    });
    expect(pathGoalCard(path("behindTrimmed")).detail).toBe("53 lessons a week · A bit behind");
  });

  it("reads every number from the path, nothing is typed in", () => {
    const changed = structuredClone(path("behind"));
    changed.progress.targetLevel = "B2";
    changed.progress.targetDate = "2029-02-03";
    changed.progress.requiredPerWeek = 1;
    changed.statusLine = "Goal reached";
    expect(pathGoalCard(changed)).toMatchObject({
      headline: "B2 by 3 Feb 2029",
      detail: "1 lesson a week · Goal reached",
    });
  });

  it("drops the weekly number when the server says there is none (goal reached or date passed)", () => {
    const done = structuredClone(path("behind"));
    done.progress.requiredPerWeek = 0;
    done.statusLine = "Goal reached";
    expect(pathGoalCard(done).detail).toBe("Goal reached");
  });

  it("invites a goal when there is no path", () => {
    expect(pathGoalCard(null)).toEqual({
      hasGoal: false,
      kicker: "My goal",
      headline: "Set a goal",
      detail: "Pick a level and a date and we work out the lessons a week.",
    });
  });

  it("formats dates with a fixed English table and leaves anything else alone", () => {
    expect(formatGoalDate("2026-09-05")).toBe("5 Sep 2026");
    expect(formatGoalDate("2026-02-31")).toBe("2026-02-31");
    expect(formatGoalDate("soon")).toBe("soon");
  });

  it("is the same wording the iOS and Android cards print", () => {
    const swift = readFileSync(
      new URL(
        "../../ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PathGoalCard.swift",
        import.meta.url,
      ),
      "utf8",
    );
    const kotlin = readFileSync(
      new URL(
        "../../android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/path/PathGoalCard.kt",
        import.meta.url,
      ),
      "utf8",
    );
    for (const text of [
      "My goal",
      "Set a goal",
      "Pick a level and a date and we work out the lessons a week.",
      "lessons",
      "lesson",
      "a week",
    ]) {
      expect(swift, `Swift: ${text}`).toContain(text);
      expect(kotlin, `Kotlin: ${text}`).toContain(text);
    }
    expect(swift).toContain("00B7");
    expect(kotlin).toContain(String.fromCharCode(0xb7));
  });
});

describe("pathGoalChips", () => {
  it("is the purpose, the level and the date", () => {
    expect(pathGoalChips("travel", "B1", "2027-05-10")).toEqual([
      "Travel",
      "Finish B1",
      "by 10 May 2027",
    ]);
    expect(pathGoalChips("exam", "A2", "2027-01-02")[0]).toBe("An exam");
  });
  it("leaves out a missing or unknown purpose rather than inventing one", () => {
    for (const p of [null, undefined, "", "teleport"]) {
      expect(pathGoalChips(p, "A2", "2027-01-02")).toEqual(["Finish A2", "by 2 Jan 2027"]);
    }
  });
});
