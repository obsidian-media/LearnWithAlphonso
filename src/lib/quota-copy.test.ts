import { describe, expect, it } from "vitest";
import { quotaExceededMessage } from "./quota-copy";

const NOW = new Date("2026-10-07T18:00:00Z");

describe("quotaExceededMessage", () => {
  it("names the reset time for the daily cap", () => {
    expect(quotaExceededMessage("2026-10-08T00:00:00.000Z", NOW, "UTC")).toBe(
      "You've reached today's AI practice limit. It resets at 12:00 AM.",
    );
  });

  it("says wait a minute for the per-minute burst", () => {
    expect(quotaExceededMessage("2026-10-07T18:01:00.000Z", NOW, "UTC")).toBe(
      "Too many requests. Wait a minute and try again.",
    );
  });

  it("falls back to tomorrow without a usable time", () => {
    const fallback = "You've reached today's AI practice limit. Try again tomorrow.";
    expect(quotaExceededMessage(null, NOW)).toBe(fallback);
    expect(quotaExceededMessage("not a date", NOW)).toBe(fallback);
  });
});
