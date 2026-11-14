import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "../data/achievements";
import {
  badgeRing,
  badgeSrc,
  badgeStates,
  ladderTitle,
  progressLine,
  tierLabel,
  unlockedDate,
  unlockedLine,
  unlockLine,
  unlockPose,
} from "./badge-state";

describe("badgeSrc", () => {
  it("every achievement has its medallion bundled", () => {
    expect(ACHIEVEMENTS).toHaveLength(25);
    for (const a of ACHIEVEMENTS) expect(existsSync(`public${badgeSrc(a.id)}`), a.id).toBe(true);
  });
});

describe("badgeStates", () => {
  const cat = [
    { id: "a1", category: "streak", threshold: 3 },
    { id: "a2", category: "streak", threshold: 7 },
    { id: "a3", category: "streak", threshold: 30 },
    { id: "t1", category: "team", threshold: 1 },
    { id: "x1", category: "xp", threshold: 100 },
  ];
  it("an unlocked badge is earned, whatever the numbers say", () => {
    const r = badgeStates(cat, new Set(["a1", "t1"]), { streak: 0 });
    expect(r.a1).toEqual({ state: "earned", value: null });
    expect(r.t1.state).toBe("earned");
  });
  it("only the next badge of a family shows progress; the rest stay locked", () => {
    const r = badgeStates(cat, new Set(["a1"]), { streak: 4 });
    expect(r.a2).toEqual({ state: "progress", value: 4 });
    expect(r.a3.state).toBe("locked");
  });
  it("needs some headway: a stat of 0, a missing stat and the server-only team badge stay locked", () => {
    const r = badgeStates(cat, new Set(), { streak: 0, team: 9 });
    expect(r.a1.state).toBe("locked");
    expect(r.x1.state).toBe("locked");
    expect(r.t1.state).toBe("locked");
  });
  it("a stat already past the threshold but not granted is a full ring, not locked", () => {
    const r = badgeStates(cat, new Set(), { streak: 5 });
    expect(r.a1).toEqual({ state: "progress", value: 5 });
  });
});

describe("badgeRing", () => {
  it("is the fraction done, clamped", () => {
    expect(badgeRing({ value: 12, threshold: 30 })).toBeCloseTo(0.4);
    expect(badgeRing({ value: 99, threshold: 30 })).toBe(1);
    expect(badgeRing({ value: -3, threshold: 30 })).toBe(0);
    expect(badgeRing({ value: null, threshold: 30 })).toBe(0);
    expect(badgeRing({ value: 5, threshold: 0 })).toBe(0);
  });
});

describe("lines", () => {
  it("formats progress and the unlocked count", () => {
    expect(progressLine(12, 30)).toBe("12 of 30");
    expect(progressLine(1240, 2000)).toBe("1,240 of 2,000");
    expect(progressLine(5, 3)).toBe("3 of 3");
    expect(unlockedLine(7, 25)).toBe("7 of 25 unlocked");
  });
});

describe("tierLabel", () => {
  it("capitalises the tier, and the two top rungs are diamond prime", () => {
    expect(tierLabel({ id: "streak_3", tier: "bronze" })).toBe("Bronze");
    expect(tierLabel({ id: "streak_100", tier: "diamond" })).toBe("Diamond");
    expect(tierLabel({ id: "streak_365", tier: "diamond" })).toBe("Diamond prime");
    expect(tierLabel({ id: "xp_25000", tier: "diamond" })).toBe("Diamond prime");
  });
});

describe("ladderTitle and unlockedDate", () => {
  it("names the family", () => {
    expect(ladderTitle("streak")).toBe("Streak ladder");
    expect(ladderTitle("freeze")).toBe("Streak freeze ladder");
  });
  it("formats an unlock date and ignores nonsense", () => {
    expect(unlockedDate("2026-11-09T22:15:00Z")).toBe("Nov 9, 2026");
    // Early in the UTC day: still the 9th in UTC, whatever the learner's own zone says.
    expect(unlockedDate("2026-11-09T01:30:00Z")).toBe("Nov 9, 2026");
    expect(unlockedDate(null)).toBeNull();
    expect(unlockedDate("not a date")).toBeNull();
  });
});

describe("the unlock sheet", () => {
  it("celebrates streaks and XP in words, and says nothing extra for the rest", () => {
    expect(unlockLine({ category: "streak", threshold: 30 })).toBe(
      "Your streak just hit 30 days. Keep it going tomorrow.",
    );
    expect(unlockLine({ category: "xp", threshold: 2000 })).toBe(
      "You have earned 2,000 XP in total.",
    );
    expect(unlockLine({ category: "lessons", threshold: 5 })).toBeNull();
    expect(unlockLine({ category: "team", threshold: 1 })).toBeNull();
  });
  it("Alphonso shows the flame for a streak and the impressed pose for the rest", () => {
    expect(unlockPose({ category: "streak" })).toBe("streak-flame");
    expect(unlockPose({ category: "xp" })).toBe("surprised-impressed");
    expect(unlockPose({ category: "freeze" })).toBe("surprised-impressed");
  });
});
