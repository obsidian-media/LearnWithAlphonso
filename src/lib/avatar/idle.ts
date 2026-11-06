export type EarSide = "left" | "right";

/** A source of numbers in [0, 1), injectable so the idle life is deterministic in tests. */
export type RandomSource = () => number;

const MASK64 = (1n << 64n) - 1n;

/** SplitMix64: the same seed always gives the same stream, and the same one as the Swift and Kotlin ports. */
export function seededRandom(seed: bigint): RandomSource {
  let state = BigInt.asUintN(64, seed);
  return () => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK64;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    z ^= z >> 31n;
    return Number(z >> 11n) * (1 / 9_007_199_254_740_992);
  };
}

export const EAR_TWITCH_DURATION = 0.16;
export const GLINT_DURATION = 0.7;

/**
 * When the ears twitch and the glint sweeps while he idles. Ears: every 4 to 9 seconds, one random side for about
 * 160 ms. Glint: every 6 to 12 seconds, a sweep of about 700 ms. Drive it with a monotonic clock; `advance` can
 * jump any distance and catches up.
 */
export class IdleScheduler {
  private nextEar: number;
  private earStart = -Infinity;
  private earSide: EarSide = "left";
  private nextGlint: number;
  private glintStart = -Infinity;

  twitchingEar: EarSide | null = null;
  /** 0 at the start of a sweep, up to just under 1; null when no sweep is running. */
  glintProgress: number | null = null;

  constructor(private readonly random: RandomSource) {
    this.nextEar = this.interval(4, 9);
    this.nextGlint = this.interval(6, 12);
  }

  private interval(low: number, high: number): number {
    return low + this.random() * (high - low);
  }

  advance(now: number): void {
    while (now >= this.nextEar) {
      this.earStart = this.nextEar;
      this.earSide = this.random() < 0.5 ? "left" : "right";
      this.nextEar = this.earStart + this.interval(4, 9);
    }
    this.twitchingEar =
      now >= this.earStart && now < this.earStart + EAR_TWITCH_DURATION ? this.earSide : null;

    while (now >= this.nextGlint) {
      this.glintStart = this.nextGlint;
      this.nextGlint = this.glintStart + this.interval(6, 12);
    }
    const progress = (now - this.glintStart) / GLINT_DURATION;
    this.glintProgress = progress >= 0 && progress < 1 ? progress : null;
  }
}

export const BREATH_PERIOD = 4.2;
export const SWAY_PERIOD = 7;

/** Degrees, within plus or minus 0.45. The slow sway about the bottom centre. */
export function swayDegrees(time: number): number {
  return 0.45 * Math.sin((2 * Math.PI * time) / SWAY_PERIOD);
}

/** Scale factors from 1 up to 1.007 across and 1.011 tall. */
export function breathScale(time: number): { x: number; y: number } {
  const phase = (1 - Math.cos((2 * Math.PI * time) / BREATH_PERIOD)) / 2;
  return { x: 1 + 0.007 * phase, y: 1 + 0.011 * phase };
}
