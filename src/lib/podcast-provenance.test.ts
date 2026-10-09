import { describe, expect, it } from "vitest";
import {
  isPublishableProvider,
  LICENSED_PROVIDERS,
  UNPUBLISHABLE_PROVIDER_MESSAGE,
  VOICE_PROVIDERS,
} from "./podcast-provenance";

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

  it("has an admin-facing message that names the allowed providers", () => {
    for (const provider of LICENSED_PROVIDERS) {
      expect(UNPUBLISHABLE_PROVIDER_MESSAGE).toContain(provider);
    }
  });
});
