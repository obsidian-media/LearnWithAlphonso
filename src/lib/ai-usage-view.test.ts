import { describe, expect, it } from "vitest";
import { parseAiUsage } from "./ai-usage-view";

const RESET = "2026-12-01T00:00:00.000Z";

describe("parseAiUsage", () => {
  it("maps each known state to its word and clamps the percent", () => {
    expect(parseAiUsage({ state: "ok", percentUsed: 37, resetsAt: RESET })).toMatchObject({
      state: "ok",
      percent: 37,
      label: "Plenty left",
      resetLine: "Resets on 1 December",
    });
    expect(parseAiUsage({ state: "warn", percentUsed: 85, resetsAt: RESET })?.label).toBe(
      "Getting close",
    );
    expect(parseAiUsage({ state: "ok", percentUsed: 250, resetsAt: RESET })?.percent).toBe(100);
    expect(parseAiUsage({ state: "ok", percentUsed: -4, resetsAt: RESET })?.percent).toBe(0);
  });
  it("a capped learner is always at 100", () => {
    const v = parseAiUsage({ state: "capped", percentUsed: 0, resetsAt: RESET });
    expect(v).toMatchObject({ percent: 100, label: "Limit reached" });
  });
  it("is null for unknown and for anything malformed (fail-safe to hidden)", () => {
    for (const bad of [
      { state: "unknown", percentUsed: 0, resetsAt: RESET },
      { state: "okay", percentUsed: 10, resetsAt: RESET },
      { state: "ok", percentUsed: "10", resetsAt: RESET },
      { state: "ok" },
      { error: "x" },
      null,
      "ok",
      42,
    ]) {
      expect(parseAiUsage(bad)).toBeNull();
    }
  });
  it("falls back to a date-free reset line when the instant is unreadable", () => {
    expect(parseAiUsage({ state: "ok", percentUsed: 1, resetsAt: "soon" })?.resetLine).toBe(
      "Resets at the start of next month",
    );
    expect(parseAiUsage({ state: "ok", percentUsed: 1 })?.resetLine).toBe(
      "Resets at the start of next month",
    );
  });
  it("formats the reset in UTC across a year boundary", () => {
    expect(
      parseAiUsage({ state: "ok", percentUsed: 1, resetsAt: "2027-01-01T00:00:00.000Z" })
        ?.resetLine,
    ).toBe("Resets on 1 January");
  });
});
