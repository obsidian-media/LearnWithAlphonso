/**
 * The bars of a "Hear you vs Alphonso" waveform. One pure function, mirrored one for one by
 * LearnWithAlphonsoKit/Waveform.swift and core/logic/Waveform.kt, with identical fixtures in the three test suites.
 */

/** How many bars each waveform draws (the spec says about 40 to 60). */
export const WAVE_BARS = 48;

/**
 * Downsample audio samples (any scale, sign ignored) to `bars` heights in [0, 1]: the samples are cut into `bars`
 * equal buckets (bucket i is [floor(i*n/bars), floor((i+1)*n/bars)) ), each bucket's height is its loudest absolute
 * sample, and the whole row is divided by the loudest bucket so the tallest bar is 1. An empty bucket, a silent clip
 * and no samples at all give 0 (the screen draws those as a flat row).
 */
export function waveformPeaks(samples: ArrayLike<number>, bars: number = WAVE_BARS): number[] {
  const out = new Array<number>(Math.max(0, Math.floor(bars))).fill(0);
  const n = samples.length;
  if (n === 0 || out.length === 0) return out;
  let loudest = 0;
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor((i * n) / out.length);
    const to = Math.floor(((i + 1) * n) / out.length);
    let peak = 0;
    for (let j = from; j < to; j++) {
      const a = Math.abs(samples[j]);
      if (a > peak) peak = a;
    }
    out[i] = peak;
    if (peak > loudest) loudest = peak;
  }
  if (loudest === 0) return out;
  return out.map((p) => p / loudest);
}

/** The shared fixtures: [samples, bars, expected]. Every platform's test asserts exactly these. */
export const WAVEFORM_FIXTURES: ReadonlyArray<{
  samples: number[];
  bars: number;
  expected: number[];
}> = [
  {
    samples: [0.125, -0.25, 0.5, -1, 0, 0.0625, -0.5, 0.25],
    bars: 4,
    expected: [0.25, 1, 0.0625, 0.5],
  },
  { samples: [0.5, -0.25, 0.125], bars: 6, expected: [0, 1, 0, 0.5, 0, 0.25] },
  { samples: [0, 0, 0, 0], bars: 2, expected: [0, 0] },
  { samples: [], bars: 3, expected: [0, 0, 0] },
];

/** Decodes a recorded clip to its mono samples (the first channel), or throws when it cannot. */
export type SampleDecoder = (blob: Blob) => Promise<ArrayLike<number>>;

/** The browser's decoder: decodeAudioData on the blob. A fresh context per clip, closed straight after. */
export const decodeBlobSamples: SampleDecoder = async (blob) => {
  const Ctx =
    typeof AudioContext !== "undefined"
      ? AudioContext
      : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("no audio decoding");
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    return buf.getChannelData(0);
  } finally {
    void ctx.close?.();
  }
};
