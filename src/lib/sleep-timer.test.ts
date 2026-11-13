import { describe, expect, it } from "vitest";
import { SLEEP_CHOICES, sleepRemainingMs, sleepShouldPause, startSleep } from "./sleep-timer";

describe("sleep timer", () => {
  it("offers off, 15, 30, 45 minutes and end of episode", () => {
    expect(SLEEP_CHOICES.map((c) => c.id)).toEqual(["off", "15", "30", "45", "end"]);
  });
  it("off never pauses and has no remaining time", () => {
    const s = startSleep("off", 1000);
    expect(sleepRemainingMs(s, 9_999_999)).toBeNull();
    expect(sleepShouldPause(s, 9_999_999, false)).toBe(false);
  });
  it("a timed choice pauses exactly at its deadline, not before", () => {
    const s = startSleep("15", 1_000);
    expect(sleepRemainingMs(s, 1_000)).toBe(15 * 60_000);
    expect(sleepShouldPause(s, 1_000 + 15 * 60_000 - 1, false)).toBe(false);
    expect(sleepShouldPause(s, 1_000 + 15 * 60_000, false)).toBe(true);
  });
  it("30 and 45 use their own length", () => {
    expect(sleepRemainingMs(startSleep("30", 0), 0)).toBe(30 * 60_000);
    expect(sleepRemainingMs(startSleep("45", 0), 0)).toBe(45 * 60_000);
  });
  it("remaining time never goes below zero", () => {
    expect(sleepRemainingMs(startSleep("15", 0), 99 * 60_000)).toBe(0);
  });
  it("end of episode ignores the clock and pauses only when the episode ended", () => {
    const s = startSleep("end", 0);
    expect(sleepRemainingMs(s, 5)).toBeNull();
    expect(sleepShouldPause(s, 99 * 3_600_000, false)).toBe(false);
    expect(sleepShouldPause(s, 0, true)).toBe(true);
  });
});
