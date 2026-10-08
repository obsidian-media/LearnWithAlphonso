import { describe, expect, it } from "vitest";
import { ALL_SYSTEM_PROMPTS, scenarioPrompt } from "./scenarios";
import { campaignScenePrompt } from "./campaigns";
import legacyPrompts from "./legacy-system-prompts.fixtures.json";

/**
 * backward-compatibility pin. The fixture is the exact set of system
 * prompts /api/chat accepted before (12 scenarios + 3 composed campaign
 * scenes), captured from the bundled iOS JSON at origin/main before the data
 * model changed. TestFlight builds 49 and earlier, the current Android app
 * and any open web tab send these strings verbatim, so every one of them
 * must stay in the whitelist until those clients are retired. Never
 * regenerate this fixture from the new data: that would make the test
 * compare the data with itself.
 */
describe("legacy English system prompts", () => {
  it("captured all 15 previous single-course prompts", () => {
    expect(legacyPrompts).toHaveLength(15);
  });

  it("are all still accepted by ALL_SYSTEM_PROMPTS", () => {
    for (const prompt of legacyPrompts) {
      expect(ALL_SYSTEM_PROMPTS.has(prompt), prompt.slice(0, 60)).toBe(true);
    }
  });

  it("are exactly what the en accessors return today", () => {
    expect(scenarioPrompt("coffee", "en")).toBe(legacyPrompts[0]);
    expect(scenarioPrompt("debate", "en")).toBe(legacyPrompts[11]);
    expect(campaignScenePrompt("city-day", "coffee-stop", "en")).toBe(legacyPrompts[12]);
    expect(campaignScenePrompt("city-day", "small-talk", "en")).toBe(legacyPrompts[14]);
  });
});
