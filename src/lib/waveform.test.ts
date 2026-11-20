import { describe, expect, it } from "vitest";
import { WAVEFORM_FIXTURES, WAVE_BARS, waveformPeaks } from "./waveform";

describe("waveformPeaks", () => {
  it.each(WAVEFORM_FIXTURES.map((f, i) => [i, f] as const))(
    "shared fixture %i gives the same bars as Swift and Kotlin",
    (_i, f) => {
      expect(waveformPeaks(f.samples, f.bars)).toEqual(f.expected);
    },
  );

  it("draws WAVE_BARS bars by default, tallest is 1, all in [0, 1]", () => {
    const samples = Array.from({ length: 4800 }, (_, i) => Math.sin(i / 7) * (1 + (i % 50) / 50));
    const bars = waveformPeaks(samples);
    expect(bars).toHaveLength(WAVE_BARS);
    expect(Math.max(...bars)).toBe(1);
    expect(bars.every((b) => b >= 0 && b <= 1)).toBe(true);
  });

  it("ignores the sign and the scale of the samples", () => {
    expect(waveformPeaks([-2, 4, -8, 1], 2)).toEqual(waveformPeaks([0.25, -0.5, 1, -0.125], 2));
  });

  it("a louder part is a taller bar", () => {
    const quietThenLoud = [...new Array(10).fill(0.1), ...new Array(10).fill(0.9)];
    const [a, b] = waveformPeaks(quietThenLoud, 2);
    expect(a).toBeLessThan(b);
  });
});
