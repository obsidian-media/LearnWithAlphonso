import { describe, expect, it } from "vitest";
import { isPublishableProvider, LICENSED_PROVIDERS, VOICE_PROVIDERS } from "./podcast-provenance";

describe("podcast provenance", () => {
  it("knows every provider used so far", () => {
    expect(VOICE_PROVIDERS).toEqual(["deepgram", "elevenlabs", "edge-tts", "human", "unknown"]);
  });

  it("publishes only audio the app is licensed to distribute", () => {
    expect(LICENSED_PROVIDERS).toEqual(["deepgram", "human"]);
    expect(isPublishableProvider("deepgram")).toBe(true);
    expect(isPublishableProvider("human")).toBe(true);
    for (const provider of ["elevenlabs", "edge-tts", "unknown", "", null, undefined, "Deepgram"]) {
      expect(isPublishableProvider(provider)).toBe(false);
    }
  });
});
