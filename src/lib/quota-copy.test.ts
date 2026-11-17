import { describe, expect, it } from "vitest";
import { quotaExceededMessage } from "./quota-copy";

const NOW = new Date("2026-10-07T18:00:00Z");

describe("quotaExceededMessage", () => {
  it("names the reset time for the daily cap", () => {
    expect(quotaExceededMessage("2026-10-08T00:00:00.000Z", NOW, "UTC")).toBe(
      "You've reached today's AI practice limit. It resets at 12:00 AM.",
    );
  });

  it("names the reset DATE for the monthly cost cap, and what still works", () => {
    const msg = quotaExceededMessage(
      "2026-12-01T00:00:00.000Z",
      new Date("2026-11-17T18:00:00Z"),
      "UTC",
    );
    expect(msg).toBe(
      "You've hit this month's usage limit for AI practice. It resets on 1 December. Lessons and review still work.",
    );
  });

  it("a reset a day away is still the daily copy, not the monthly one", () => {
    expect(quotaExceededMessage("2026-10-08T23:59:00.000Z", NOW, "UTC")).toContain(
      "today's AI practice limit",
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
