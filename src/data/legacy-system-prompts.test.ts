import { describe, expect, it } from "vitest";
import { ALL_SYSTEM_PROMPTS, canonicalSystemPrompt, scenarioPrompt } from "./scenarios";
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

  it("are all still accepted, as themselves or as the current prompt that replaced them", () => {
    for (const prompt of legacyPrompts) {
      const current = canonicalSystemPrompt(prompt);
      expect(current, prompt.slice(0, 60)).toBeDefined();
      expect(ALL_SYSTEM_PROMPTS.has(current as string)).toBe(true);
    }
  });

  it("are exactly what the en accessors return today", () => {
    expect(scenarioPrompt("coffee", "en")).toBe(legacyPrompts[0]);
    expect(scenarioPrompt("debate", "en")).toBe(legacyPrompts[11]);
    // The city-day premise was reworded by the held-back review, so those three resolve through the alias map.
    expect(canonicalSystemPrompt(legacyPrompts[12])).toBe(
      campaignScenePrompt("city-day", "coffee-stop", "en"),
    );
    expect(canonicalSystemPrompt(legacyPrompts[14])).toBe(
      campaignScenePrompt("city-day", "small-talk", "en"),
    );
  });
});
