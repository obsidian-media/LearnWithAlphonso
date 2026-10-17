import { describe, expect, it } from "vitest";
import { AI_NARRATED_LABEL, isAiNarrated } from "./podcast-label";

describe("AI-narrated label", () => {
  it("applies to text-to-speech episodes only", () => {
    expect(isAiNarrated("tts")).toBe(true);
    expect(isAiNarrated("upload")).toBe(false);
    expect(isAiNarrated(null)).toBe(false);
    expect(isAiNarrated(undefined)).toBe(false);
  });

  it("uses the wording the native apps copy", () => {
    expect(AI_NARRATED_LABEL).toBe("AI-narrated");
  });
});
