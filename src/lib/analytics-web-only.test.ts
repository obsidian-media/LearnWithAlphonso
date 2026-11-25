import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENTS, WEB_ONLY_EVENTS, sanitizeEventProps } from "./analytics-events";

describe("web-only analytics events", () => {
  it("stay out of the shared list, so iOS and Android need no sender", () => {
    for (const e of WEB_ONLY_EVENTS)
      expect((ANALYTICS_EVENTS as readonly string[]).includes(e)).toBe(false);
  });

  it("voice_playback_failed keeps only identifiers, never text or user data", () => {
    expect(
      sanitizeEventProps("voice_playback_failed", {
        surface: "hector",
        reason: "play_blocked",
        error_kind: "NotAllowedError",
        text: "Bonjour, je m'appelle Sam",
        email: "sam@example.com",
      }),
    ).toEqual({ surface: "hector", reason: "play_blocked", error_kind: "NotAllowedError" });
    expect(
      sanitizeEventProps("voice_playback_failed", { error_kind: "a sentence with spaces" }),
    ).toEqual({});
  });
});
