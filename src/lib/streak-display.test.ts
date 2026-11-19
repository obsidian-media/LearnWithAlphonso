import { describe, expect, it } from "vitest";
import { computeStreakUpdate } from "@/lib/progress-math";
import { localDay } from "@/lib/local-day";
import { shownStreak, streakAriaLabel } from "@/lib/streak-display";

/**
 * The same cases as the iOS Kit's SyncReliabilityTests ("testTheServerStep…" and the displayed streak) and the Android
 * core's StreakDisplayTest, so the web reads a streak the way the server will treat it.
 */
const step = (
  streak: number,
  longest: number,
  last: string | null,
  freezes: number,
  basis: string | null,
  today = "2026-11-17",
) =>
  computeStreakUpdate({
    lastActiveDate: last,
    today,
    streak,
    longestStreak: longest,
    freezes,
    bridgeUtcDay: basis !== "local",
  });

const shown = (
  streak: number,
  last: string,
  freezes: number | null,
  basis: string | null = "local",
  today = "2026-11-17",
) => shownStreak({ streak, lastActiveDate: last, streakFreezes: freezes, dayBasis: basis }, today);

describe("the server's streak step", () => {
  it("on the same day changes nothing", () => {
    expect(step(5, 8, "2026-11-17", 1, "local")).toEqual({
      streak: 5,
      longestStreak: 8,
      freezes: 1,
    });
  });
  it("on the next day adds one", () => {
    expect(step(5, 5, "2026-11-16", 0, "local")).toEqual({
      streak: 6,
      longestStreak: 6,
      freezes: 0,
    });
  });
  it("spends a freeze on one missed day", () => {
    expect(step(5, 9, "2026-11-15", 2, "local")).toEqual({
      streak: 6,
      longestStreak: 9,
      freezes: 1,
    });
  });
  it("restarts after one missed day without a freeze", () => {
    expect(step(5, 9, "2026-11-15", 0, "local")).toEqual({
      streak: 1,
      longestStreak: 9,
      freezes: 0,
    });
  });
  it("bridges the UTC day once without a freeze", () => {
    expect(step(5, 5, "2026-11-15", 1, "utc")).toEqual({ streak: 6, longestStreak: 6, freezes: 1 });
  });
  it("restarts after two missed days whatever the freezes", () => {
    for (const basis of ["local", "utc"]) {
      expect(step(12, 12, "2026-11-14", 5, basis), basis).toEqual({
        streak: 1,
        longestStreak: 12,
        freezes: 5,
      });
    }
  });
  it("earns a freeze on every tenth day", () => {
    expect(step(9, 9, "2026-11-16", 0, "local")).toEqual({
      streak: 10,
      longestStreak: 10,
      freezes: 1,
    });
    expect(step(19, 19, "2026-11-15", 1, "local")).toEqual({
      streak: 20,
      longestStreak: 20,
      freezes: 1,
    });
  });
});

describe("the displayed streak", () => {
  it("reads normally when studied today or yesterday", () => {
    expect(shown(12, "2026-11-17", 0)).toEqual({ streak: 12, state: "active" });
    expect(shown(12, "2026-11-16", 0), "yesterday still counts: today is not over").toEqual({
      streak: 12,
      state: "active",
    });
    expect(shown(12, "2026-11-18", 0), "a skewed future day is treated as today").toEqual({
      streak: 12,
      state: "active",
    });
  });

  it("reads as protected for one missed day covered by a freeze", () => {
    expect(shown(12, "2026-11-15", 1)).toEqual({ streak: 12, state: "protected" });
    expect(shown(19, "2026-11-15", 1), "spent and earned on the tenth day").toEqual({
      streak: 19,
      state: "protected",
    });
    expect(streakAriaLabel(shown(12, "2026-11-15", 1))).toBe(
      "12-day streak, protected by a streak freeze",
    );
    expect(streakAriaLabel(shown(1, "2026-11-17", 0))).toBe("Streak: 1 day");
  });

  it("reads the UTC bridge as active, not protected", () => {
    expect(shown(12, "2026-11-15", 0, "utc")).toEqual({ streak: 12, state: "active" });
    expect(shown(12, "2026-11-15", 3, null)).toEqual({ streak: 12, state: "active" });
    expect(shown(9, "2026-11-16", 0)).toEqual({ streak: 9, state: "active" });
  });

  it("reads zero when the server would restart it", () => {
    expect(shown(12, "2026-11-15", 0), "one missed, no freeze").toEqual({
      streak: 0,
      state: "lapsed",
    });
    expect(shown(12, "2026-11-14", 5), "two missed: no freeze count saves it").toEqual({
      streak: 0,
      state: "lapsed",
    });
    expect(shown(12, "2026-11-15", null).streak, "an unknown freeze count protects nothing").toBe(
      0,
    );
    expect(streakAriaLabel(shown(12, "2026-11-15", 0))).toBe("Streak: 0 days");
  });

  it("uses the learner's local day", () => {
    const now = Date.UTC(2026, 10, 17, 15); // 2026-11-17 15:00 UTC
    const at = (last: string, freezes: number, zone: string) =>
      shown(3, last, freezes, "local", localDay(now, zone)).state;
    // Already the 18th in Auckland (UTC+13): the 16th is two days ago there, one missed day.
    expect(at("2026-11-16", 0, "Pacific/Auckland")).toBe("lapsed");
    expect(at("2026-11-16", 1, "Pacific/Auckland")).toBe("protected");
    expect(at("2026-11-17", 0, "Pacific/Auckland")).toBe("active");
    // Still 07:00 on the 17th in Los Angeles: the 16th is yesterday.
    expect(at("2026-11-16", 0, "America/Los_Angeles")).toBe("active");
    expect(at("2026-11-15", 0, "America/Los_Angeles")).toBe("lapsed");
  });

  it("changes day at local midnight", () => {
    const midnight18th = Date.UTC(2026, 10, 18);
    const at = (ms: number) => shown(4, "2026-11-16", 0, "local", localDay(ms, "UTC")).state;
    expect(at(midnight18th - 1000)).toBe("active");
    expect(at(midnight18th)).toBe("lapsed");
  });

  it("shows nothing to protect with no streak or no last day", () => {
    expect(
      shownStreak(
        { streak: 0, lastActiveDate: "2026-11-01", streakFreezes: 2, dayBasis: "local" },
        "2026-11-17",
      ),
    ).toEqual({
      streak: 0,
      state: "active",
    });
    expect(
      shownStreak(
        { streak: 3, lastActiveDate: null, streakFreezes: 2, dayBasis: "local" },
        "2026-11-17",
      ),
    ).toEqual({
      streak: 3,
      state: "active",
    });
  });
});
