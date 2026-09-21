import { describe, expect, it } from "vitest";
import { CAMPAIGNS, getCampaign } from "./campaigns";

describe("campaigns data", () => {
  it("ships at least one campaign with 2+ scenes (proof of the architecture)", () => {
    expect(CAMPAIGNS.length).toBeGreaterThanOrEqual(1);
    for (const c of CAMPAIGNS) {
      expect(c.scenes.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("gives every scene a positive minTurns gate", () => {
    for (const c of CAMPAIGNS) {
      for (const s of c.scenes) {
        expect(s.minTurns).toBeGreaterThan(0);
      }
    }
  });

  it("getCampaign finds a known campaign by id and returns undefined for an unknown one", () => {
    expect(getCampaign("city-day")?.title).toBe("A day in a new city");
    expect(getCampaign("does-not-exist")).toBeUndefined();
  });

  it("has unique scene ids within each campaign", () => {
    for (const c of CAMPAIGNS) {
      const ids = c.scenes.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
