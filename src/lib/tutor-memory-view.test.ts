import { describe, expect, it } from "vitest";
import {
  addableGoals,
  agoLabel,
  goalLines,
  memorySummary,
  mistakeNote,
  removeGoalPatch,
} from "./tutor-memory-view";
import { learnerProfilePatchSchema } from "./learner-profile";

const NOW = Date.parse("2026-11-16T12:00:00Z");
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe("agoLabel", () => {
  it.each([
    [0, "today"],
    [1, "yesterday"],
    [2, "2 days ago"],
    [5, "5 days ago"],
    [8, "last week"],
    [21, "3 weeks ago"],
    [75, "2 months ago"],
  ])("%i days -> %s", (d, label) => expect(agoLabel(ago(d), NOW)).toBe(label));
});

describe("copy", () => {
  it("mistake note and summary count correctly", () => {
    expect(mistakeNote({ seenCount: 4, lastSeenAt: ago(2) }, NOW)).toBe(
      "Seen in 4 calls, last 2 days ago",
    );
    expect(mistakeNote({ seenCount: 1, lastSeenAt: ago(0) }, NOW)).toBe(
      "Seen in 1 call, last today",
    );
    expect(mistakeNote({ seenCount: 2, lastSeenAt: ago(9) }, NOW)).toBe(
      "Seen in 2 calls, last week",
    );
    expect(memorySummary({ mistakes: 3, phrases: 4, goals: 3 })).toBe(
      "3 mistakes, 4 phrases, 3 goals.",
    );
    expect(memorySummary({ mistakes: 1, phrases: 1, goals: 1 })).toBe(
      "1 mistake, 1 phrase, 1 goal.",
    );
  });
});

describe("goals are the learner's own first-run answers", () => {
  it("lists each answer in their words and nothing else", () => {
    expect(goalLines({ goal: "travel", dailyMinutes: 10, interests: ["food", "music"] })).toEqual([
      { key: "goal", title: "Travel", note: "You chose this when you started" },
      { key: "dailyMinutes", title: "10 minutes a day", note: "You chose this when you started" },
      { key: "interests", title: "Food and music", note: "Topics you picked" },
    ]);
    expect(goalLines({ goal: null, dailyMinutes: null, interests: [] })).toEqual([]);
  });
  it("drops values that are not on the preset lists", () => {
    expect(goalLines({ goal: "world domination", dailyMinutes: 7, interests: ["x"] })).toEqual([]);
  });
  it("removing a line is a patch the server schema accepts, and only the presets can be added", () => {
    for (const k of ["goal", "dailyMinutes", "interests"] as const)
      expect(learnerProfilePatchSchema.safeParse(removeGoalPatch(k)).success).toBe(true);
    const a = addableGoals({ goal: "travel", dailyMinutes: null, interests: ["food"] });
    expect(a.goals).toEqual([]);
    expect(a.minutes.map((m) => m.id)).toEqual([5, 10, 15, 20]);
    expect(a.interests.map((i) => i.id)).not.toContain("food");
  });
});

describe("clearing a goal answer", () => {
  it("mergeLearnerProfile removes exactly the cleared answers and keeps the rest", async () => {
    const { mergeLearnerProfile, parseLearnerProfile } = await import("./learner-profile");
    const current = parseLearnerProfile({
      goal: "travel",
      dailyMinutes: 10,
      interests: ["food"],
      name: "Sam",
      level: "some",
    });
    const out = mergeLearnerProfile(current, removeGoalPatch("goal"));
    expect(out.goal).toBeUndefined();
    expect(out).toMatchObject({
      dailyMinutes: 10,
      interests: ["food"],
      name: "Sam",
      level: "some",
    });
    const all = mergeLearnerProfile(current, { clear: ["goal", "dailyMinutes", "interests"] });
    expect(all.goal).toBeUndefined();
    expect(all.dailyMinutes).toBeUndefined();
    expect(all.interests).toBeUndefined();
    expect(all.name).toBe("Sam");
  });
});
