import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "../data/achievements";
import {
  badgeRing,
  badgeSrc,
  badgeState,
  ladderTitle,
  progressLine,
  tierLabel,
  unlockedDate,
  unlockedLine,
} from "./badge-state";

describe("badgeSrc", () => {
  it("every achievement has its medallion bundled", () => {
    expect(ACHIEVEMENTS).toHaveLength(25);
    for (const a of ACHIEVEMENTS) expect(existsSync(`public${badgeSrc(a.id)}`), a.id).toBe(true);
  });
});

describe("badgeState", () => {
  it("an unlocked badge is earned, whatever the numbers say", () => {
    expect(badgeState({ unlocked: true, value: 0, threshold: 30 })).toBe("earned");
    expect(badgeState({ unlocked: true, value: null, threshold: 1 })).toBe("earned");
  });
  it("is in progress between nothing and the threshold", () => {
    expect(badgeState({ unlocked: false, value: 12, threshold: 30 })).toBe("progress");
    expect(badgeState({ unlocked: false, value: 29, threshold: 30 })).toBe("progress");
  });
  it("is locked with no headway, and when the value already passes the threshold unlock is the server's call", () => {
    expect(badgeState({ unlocked: false, value: 0, threshold: 30 })).toBe("locked");
    expect(badgeState({ unlocked: false, value: 30, threshold: 30 })).toBe("locked");
    expect(badgeState({ unlocked: false, value: null, threshold: 1 })).toBe("locked");
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
    expect(unlockedDate(null)).toBeNull();
    expect(unlockedDate("not a date")).toBeNull();
  });
});
