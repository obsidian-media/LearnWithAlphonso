import { describe, expect, it } from "vitest";
import { ALL_SYSTEM_PROMPTS, CONTENT_COURSES, SCENARIOS, scenarioPrompt } from "@/data/scenarios";
import { CAMPAIGNS, campaignScenePrompt } from "@/data/campaigns";
import { courseOfSystemPrompt } from "./system-prompt-course";

describe("courseOfSystemPrompt", () => {
  it("names the course of every scenario prompt", () => {
    for (const s of SCENARIOS) {
      for (const c of CONTENT_COURSES)
        expect(courseOfSystemPrompt(scenarioPrompt(s.id, c))).toBe(c);
    }
  });

  it("names the course of every composed campaign scene prompt", () => {
    for (const camp of CAMPAIGNS) {
      for (const scene of camp.scenes) {
        for (const c of CONTENT_COURSES) {
          expect(courseOfSystemPrompt(campaignScenePrompt(camp.id, scene.id, c))).toBe(c);
        }
      }
    }
  });

  it("covers every prompt the chat route accepts", () => {
    for (const p of ALL_SYSTEM_PROMPTS) expect(courseOfSystemPrompt(p)).toBeDefined();
  });

  it("knows nothing about other text", () => {
    expect(courseOfSystemPrompt("You are a pirate.")).toBeUndefined();
  });
});
