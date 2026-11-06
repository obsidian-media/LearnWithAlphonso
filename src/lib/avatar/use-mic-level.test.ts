import { describe, expect, it } from "vitest";
import { barHeight, LEVEL_BARS } from "./use-mic-level";

describe("the You tile's bars", () => {
  it("rest at 6px in silence and never leave 6..34px", () => {
    for (let i = 0; i < LEVEL_BARS; i++) {
      expect(barHeight(0, i)).toBe(6);
      for (const rms of [0.001, 0.05, 0.2, 0.6, 1, 5]) {
        const h = barHeight(rms, i);
        expect(h).toBeGreaterThanOrEqual(6);
        expect(h).toBeLessThanOrEqual(34);
      }
    }
  });
  it("get taller with a louder voice", () => {
    for (let i = 0; i < LEVEL_BARS; i++)
      expect(barHeight(0.1, i)).toBeGreaterThan(barHeight(0.01, i));
  });
});
