import { describe, expect, it } from "vitest";
import {
  HEART_REFILL_MS,
  MAX_HEARTS,
  XP_HEART_COST,
  buyHeartWithXp,
  gainHearts,
  heartsGate,
  loseHeart,
  perfectLessonBonusEarned,
  resolveHeartsRefill,
  streakHeartMilestoneReached,
} from "./hearts";

const T0 = 1_700_000_000_000;
const STEP = HEART_REFILL_MS;

describe("resolveHeartsRefill", () => {
  it("full hearts have no timer", () => {
    expect(resolveHeartsRefill(MAX_HEARTS, T0 + 5, T0)).toEqual({
      hearts: MAX_HEARTS,
      heartsRefillAt: null,
    });
  });

  it("leaves hearts untouched before the refill timestamp", () => {
    expect(resolveHeartsRefill(2, T0 + 1000, T0)).toEqual({ hearts: 2, heartsRefillAt: T0 + 1000 });
  });

  it("gives exactly one heart when one refill is due, and the next one starts a full wait later", () => {
    expect(resolveHeartsRefill(2, T0 - 1, T0)).toEqual({
      hearts: 3,
      heartsRefillAt: T0 - 1 + STEP,
    });
  });

  it("gives a heart exactly at the refill timestamp (boundary)", () => {
    expect(resolveHeartsRefill(0, T0, T0)).toEqual({ hearts: 1, heartsRefillAt: T0 + STEP });
  });

  it("one heart per 30 minutes: two hours away gives four hearts", () => {
    const due = T0 - 4 * STEP + 1000;
    // The first heart came due 4 intervals minus 1s ago: that heart plus three whole intervals since = 4 hearts.
    expect(resolveHeartsRefill(0, due, T0)).toEqual({ hearts: 4, heartsRefillAt: due + 4 * STEP });
  });

  it("carries the leftover time into the next heart", () => {
    // 1.5 intervals past due: 2 hearts now, the third arrives half an interval later.
    const due = T0 - 1.5 * STEP;
    expect(resolveHeartsRefill(1, due, T0)).toEqual({ hearts: 3, heartsRefillAt: T0 + 0.5 * STEP });
  });

  it("caps at MAX_HEARTS and clears the timer", () => {
    expect(resolveHeartsRefill(3, T0 - 10 * STEP, T0)).toEqual({
      hearts: MAX_HEARTS,
      heartsRefillAt: null,
    });
  });

  it("starts the clock for a row below MAX_HEARTS that has none (the stuck-learner case)", () => {
    expect(resolveHeartsRefill(3, null, T0)).toEqual({ hearts: 3, heartsRefillAt: T0 + STEP });
  });
});

describe("loseHeart", () => {
  it("from full hearts starts a new 30-minute clock", () => {
    expect(loseHeart(MAX_HEARTS, null, T0)).toEqual({ hearts: 4, heartsRefillAt: T0 + STEP });
  });

  it("keeps the running clock when a heart is lost while a refill is pending", () => {
    expect(loseHeart(3, T0 + 600_000, T0)).toEqual({ hearts: 2, heartsRefillAt: T0 + 600_000 });
  });

  it("settles a due refill before taking the heart", () => {
    expect(loseHeart(2, T0 - 1, T0)).toEqual({ hearts: 2, heartsRefillAt: T0 - 1 + STEP });
  });

  it("never goes below zero and keeps the clock", () => {
    expect(loseHeart(0, T0 + 5, T0)).toEqual({ hearts: 0, heartsRefillAt: T0 + 5 });
  });
});

describe("gainHearts", () => {
  it("adds hearts up to the cap and keeps a running clock while below the cap", () => {
    expect(gainHearts(2, 1, T0 + 900, T0)).toEqual({ hearts: 3, heartsRefillAt: T0 + 900 });
  });

  it("caps at MAX_HEARTS and clears the timer", () => {
    expect(gainHearts(4, 3, T0 + 900, T0)).toEqual({ hearts: MAX_HEARTS, heartsRefillAt: null });
  });

  it("a gain from zero does not leave the learner without a timer", () => {
    expect(gainHearts(0, 1, T0 + 900, T0)).toEqual({ hearts: 1, heartsRefillAt: T0 + 900 });
    expect(gainHearts(0, 1, null, T0)).toEqual({ hearts: 1, heartsRefillAt: T0 + STEP });
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

describe("heartsGate", () => {
  it("is open with hearts left", () => {
    expect(heartsGate(1, null, 1_000)).toEqual({ blocked: false });
  });
  it("blocks at 0 hearts before the refill time and reports it", () => {
    expect(heartsGate(0, 5_000, 1_000)).toEqual({ blocked: true, refillAt: 5_000 });
  });
  it("opens once the refill time has passed", () => {
    expect(heartsGate(0, 5_000, 5_000)).toEqual({ blocked: false });
  });
  it("blocks a negative count with no timer and starts the clock", () => {
    expect(heartsGate(-1, null, 1_000)).toEqual({
      blocked: true,
      refillAt: 1_000 + HEART_REFILL_MS,
    });
  });
  it("opens with one heart after one refill, and stays blocked a moment before", () => {
    expect(heartsGate(0, 5_000, 4_999)).toEqual({ blocked: true, refillAt: 5_000 });
  });
});
