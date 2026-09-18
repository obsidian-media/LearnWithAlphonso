import { describe, expect, it } from "vitest";
import {
  MAX_HEARTS,
  XP_HEART_COST,
  buyHeartWithXp,
  gainHearts,
  perfectLessonBonusEarned,
  resolveHeartsRefill,
  streakHeartMilestoneReached,
} from "./hearts";

describe("resolveHeartsRefill", () => {
  it("leaves hearts untouched when no refill is pending", () => {
    expect(resolveHeartsRefill(3, null, Date.now())).toEqual({ hearts: 3, heartsRefillAt: null });
  });

  it("leaves hearts untouched before the refill timestamp", () => {
    const now = Date.now();
    expect(resolveHeartsRefill(0, now + 1000, now)).toEqual({
      hearts: 0,
      heartsRefillAt: now + 1000,
    });
  });

  it("restores to MAX_HEARTS and clears the timer once the timestamp has passed", () => {
    const now = Date.now();
    expect(resolveHeartsRefill(0, now - 1, now)).toEqual({
      hearts: MAX_HEARTS,
      heartsRefillAt: null,
    });
  });

  it("restores exactly at the refill timestamp (boundary)", () => {
    const now = Date.now();
    expect(resolveHeartsRefill(0, now, now)).toEqual({ hearts: MAX_HEARTS, heartsRefillAt: null });
  });
});

describe("gainHearts", () => {
  it("adds hearts up to the cap", () => {
    expect(gainHearts(3, 1)).toEqual({ hearts: 4, heartsRefillAt: null });
  });

  it("caps at MAX_HEARTS", () => {
    expect(gainHearts(4, 3)).toEqual({ hearts: MAX_HEARTS, heartsRefillAt: null });
  });

  it("clears a pending refill timer on any gain", () => {
    expect(gainHearts(0, 1)).toEqual({ hearts: 1, heartsRefillAt: null });
  });
});

describe("perfectLessonBonusEarned", () => {
  it("is true when every question was correct", () => {
    expect(perfectLessonBonusEarned(8, 8)).toBe(true);
  });

  it("is false on any miss", () => {
    expect(perfectLessonBonusEarned(7, 8)).toBe(false);
  });

  it("is false for a zero-question lesson", () => {
    expect(perfectLessonBonusEarned(0, 0)).toBe(false);
  });
});

describe("streakHeartMilestoneReached", () => {
  it("fires when the streak advances onto a multiple of 7", () => {
    expect(streakHeartMilestoneReached(6, 7)).toBe(true);
  });

  it("does not fire again on a same-day re-check (streak unchanged)", () => {
    expect(streakHeartMilestoneReached(7, 7)).toBe(false);
  });

  it("does not fire on non-multiples", () => {
    expect(streakHeartMilestoneReached(7, 8)).toBe(false);
  });

  it("fires at 14, 21, etc.", () => {
    expect(streakHeartMilestoneReached(13, 14)).toBe(true);
    expect(streakHeartMilestoneReached(20, 21)).toBe(true);
  });
});

describe("buyHeartWithXp", () => {
  it("succeeds and deducts the cost when affordable and not full", () => {
    expect(buyHeartWithXp(2, 100)).toEqual({ ok: true, hearts: 3, xp: 100 - XP_HEART_COST });
  });

  it("rejects when hearts are already full", () => {
    expect(buyHeartWithXp(MAX_HEARTS, 1000)).toEqual({ ok: false, reason: "hearts-full" });
  });

  it("rejects when XP is insufficient", () => {
    expect(buyHeartWithXp(2, XP_HEART_COST - 1)).toEqual({
      ok: false,
      reason: "insufficient-xp",
    });
  });

  it("succeeds exactly at the cost boundary", () => {
    expect(buyHeartWithXp(2, XP_HEART_COST)).toEqual({ ok: true, hearts: 3, xp: 0 });
  });
});
