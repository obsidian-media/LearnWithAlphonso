import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  LEAGUE_TIER_META,
  LEAGUE_TIERS,
  TIER_ORDER,
} from "./achievements";

describe("ACHIEVEMENTS", () => {
  it("has no duplicate ids", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every achievement has a positive threshold and a known tier/category", () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.threshold).toBeGreaterThan(0);
      expect(TIER_ORDER).toContain(a.tier);
      expect(["streak", "xp", "perfect", "lessons", "league", "freeze"]).toContain(a.category);
    }
  });
});

describe("ACHIEVEMENTS_BY_ID", () => {
  it("indexes every achievement by its id", () => {
    for (const a of ACHIEVEMENTS) {
      expect(ACHIEVEMENTS_BY_ID[a.id]).toBe(a);
    }
  });

  it("has the same size as the achievements list", () => {
    expect(Object.keys(ACHIEVEMENTS_BY_ID).length).toBe(ACHIEVEMENTS.length);
  });
});

describe("LEAGUE_TIER_META", () => {
  it("has metadata for every league tier", () => {
    for (const tier of LEAGUE_TIERS) {
      expect(LEAGUE_TIER_META[tier]).toBeDefined();
      expect(LEAGUE_TIER_META[tier].label).toBeTruthy();
      expect(LEAGUE_TIER_META[tier].hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
