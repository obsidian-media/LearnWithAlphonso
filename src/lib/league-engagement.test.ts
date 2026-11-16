import { describe, expect, it } from "vitest";
import {
  isLeaguePromotion,
  loadRecapTier,
  loadSnapshot,
  mondayDateString,
  promotionCopy,
  recapIsQuiet,
  recapPromotionLine,
  saveRecapTier,
  saveSnapshot,
  wasOvertaken,
  type LeaderboardSnapshotEntry,
} from "./league-engagement";

const board = (...ids: string[]): LeaderboardSnapshotEntry[] =>
  ids.map((userId, i) => ({ userId, xp: 100 - i }));

describe("wasOvertaken (port of wasOvertaken in LeaderboardEngagement.swift)", () => {
  it("is true when someone who was below me is now above me", () => {
    expect(wasOvertaken(board("a", "me", "b"), board("a", "b", "me"), "me")).toBe(true);
  });

  it("is false when everyone who passed me was already above me", () => {
    expect(wasOvertaken(board("a", "b", "me"), board("b", "a", "me"), "me")).toBe(false);
  });

  it("is false when I moved up, or nothing changed", () => {
    expect(wasOvertaken(board("a", "me"), board("me", "a"), "me")).toBe(false);
    expect(wasOvertaken(board("a", "me"), board("a", "me"), "me")).toBe(false);
  });

  it("is false when I am missing from either snapshot (a first visit never reports one)", () => {
    expect(wasOvertaken(board("a", "b"), board("a", "me"), "me")).toBe(false);
    expect(wasOvertaken(board("a", "me"), board("a", "b"), "me")).toBe(false);
    expect(wasOvertaken([], board("a", "me"), "me")).toBe(false);
  });

  it("does not count someone new to the board: there is no earlier state to say they were below me", () => {
    expect(wasOvertaken(board("a", "me"), board("a", "new", "me"), "me")).toBe(false);
  });

  it("counts a pass by any one of several climbers", () => {
    expect(wasOvertaken(board("a", "me", "b", "c"), board("a", "c", "me", "b"), "me")).toBe(true);
  });
});

describe("mondayDateString (the server's UTC week)", () => {
  const WED = Date.UTC(2026, 10, 18, 15, 30); // Wednesday 2026-11-18

  it("is this week's Monday for 0, last week's for 1, next week's for -1", () => {
    expect(mondayDateString(0, WED)).toBe("2026-11-16");
    expect(mondayDateString(1, WED)).toBe("2026-11-09");
    expect(mondayDateString(-1, WED)).toBe("2026-11-23");
  });

  it("a Monday is its own week's start, and a Sunday still belongs to the week before it", () => {
    expect(mondayDateString(0, Date.UTC(2026, 10, 16, 0, 0))).toBe("2026-11-16");
    expect(mondayDateString(0, Date.UTC(2026, 10, 22, 23, 59))).toBe("2026-11-16");
    expect(mondayDateString(0, Date.UTC(2026, 10, 23, 0, 0))).toBe("2026-11-23");
  });

  it("crosses a month and a year edge", () => {
    expect(mondayDateString(0, Date.UTC(2027, 0, 1))).toBe("2026-12-28");
    expect(mondayDateString(1, Date.UTC(2026, 11, 1))).toBe("2026-11-23");
  });
});

describe("isLeaguePromotion", () => {
  it("is true only when the new league is higher", () => {
    expect(isLeaguePromotion("bronze", "silver")).toBe(true);
    expect(isLeaguePromotion("bronze", "diamond")).toBe(true);
    expect(isLeaguePromotion("silver", "silver")).toBe(false);
    expect(isLeaguePromotion("ruby", "sapphire")).toBe(false);
  });

  it("never counts an unknown or missing league", () => {
    expect(isLeaguePromotion(null, "silver")).toBe(false);
    expect(isLeaguePromotion("bronze", undefined)).toBe(false);
    expect(isLeaguePromotion("copper", "silver")).toBe(false);
    expect(isLeaguePromotion("bronze", "platinum")).toBe(false);
  });
});

describe("recap and takeover copy", () => {
  it("a week with no XP is quiet", () => {
    expect(recapIsQuiet(0)).toBe(true);
    expect(recapIsQuiet(-5)).toBe(true);
    expect(recapIsQuiet(1)).toBe(false);
  });

  it("names the league by its display name", () => {
    expect(recapPromotionLine("silver")).toBe("You moved up to Sapling!");
    expect(promotionCopy("silver", "sapphire")).toEqual({
      headline: "Welcome to Grove",
      line: "You've been promoted to Grove, up from Sapling.",
    });
  });
});

describe("saved snapshot and recap tier", () => {
  function memory() {
    const data: Record<string, string> = {};
    return {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        data[k] = v;
      },
      data,
    };
  }

  it("round-trips per learner", () => {
    const s = memory();
    saveSnapshot("me", board("a", "me"), s);
    expect(loadSnapshot("me", s)).toEqual(board("a", "me"));
    expect(loadSnapshot("other", s)).toBeNull();
    saveRecapTier("me", "silver", s);
    expect(loadRecapTier("me", s)).toBe("silver");
    expect(loadRecapTier("other", s)).toBeNull();
  });

  it("reads a damaged snapshot as none", () => {
    expect(loadSnapshot("me", { getItem: () => "{x" })).toBeNull();
    expect(loadSnapshot("me", { getItem: () => '{"a":1}' })).toBeNull();
    expect(loadSnapshot("me", { getItem: () => '[{"userId":"a"}]' })).toBeNull();
    expect(loadSnapshot("me", null)).toBeNull();
    expect(loadRecapTier("me", null)).toBeNull();
  });

  it("never throws when storage refuses", () => {
    const blocked = {
      getItem: () => {
        throw new Error("no");
      },
      setItem: () => {
        throw new Error("no");
      },
    };
    expect(loadSnapshot("me", blocked)).toBeNull();
    expect(loadRecapTier("me", blocked)).toBeNull();
    expect(() => saveSnapshot("me", [], blocked)).not.toThrow();
    expect(() => saveRecapTier("me", "x", blocked)).not.toThrow();
  });
});
