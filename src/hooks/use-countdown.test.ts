import { describe, expect, it } from "vitest";
import { formatDuration } from "./use-countdown";

describe("formatDuration", () => {
  it("formats a round number of minutes", () => {
    expect(formatDuration(90_000)).toBe("1:30");
  });

  it("pads seconds under 10", () => {
    expect(formatDuration(65_000)).toBe("1:05");
  });

  it("rounds up to the nearest second", () => {
    expect(formatDuration(1500)).toBe("0:02");
  });

  it("clamps negative durations to 0:00", () => {
    expect(formatDuration(-5000)).toBe("0:00");
  });

  it("handles durations over an hour", () => {
    expect(formatDuration(65 * 60_000)).toBe("65:00");
  });
});
