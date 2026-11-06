/**
 * The lesson-complete confetti, drawn in code (the painted clip is retired). About 90 rectangles and stars burst
 * from two points under the title and fall for 1.6 s; under Reduce Motion they are a still scatter. Deterministic
 * for a seed, so a still frame never jumps. Colours are token names, read from the palette at draw time. The iOS
 * ConfettiView and Android's Confetti use the same numbers.
 */

/** Gold, the kick gold, navy, robe blue, cream and the gold edge: the robe's colours only. */
export const CONFETTI_COLOR_TOKENS = [
  "--c-xp",
  "--c-on-hero-kick",
  "--c-brand",
  "--c-choice",
  "--c-card",
  "--c-xp-edge",
] as const;
export type ConfettiColor = (typeof CONFETTI_COLOR_TOKENS)[number];

/** How long one burst is drawn; the fall itself reads as about 1.6 s. */
export const CONFETTI_SECONDS = 2.2;
const COUNT = 90;
const GRAVITY = 420;
const START_Y = 70;

export type ConfettiPiece = {
  x0: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: ConfettiColor;
  star: boolean;
  restX: number;
  restY: number;
};

export function confettiPieces(seed: number, width: number): ConfettiPiece[] {
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: COUNT }, (_, i) => ({
    x0: (i % 2 ? 0.28 : 0.72) * width,
    vx: (r() - 0.5) * 340,
    vy: -180 - r() * 260,
    rot: r() * Math.PI * 2,
    vr: (r() - 0.5) * 12,
    w: 5 + r() * 5,
    h: 8 + r() * 6,
    color: CONFETTI_COLOR_TOKENS[i % CONFETTI_COLOR_TOKENS.length],
    star: i % 9 === 0,
    restX: r() * width,
    restY: 20 + r() * 300,
  }));
}

/** Where a piece is `t` seconds into the burst. */
export function pieceAt(p: ConfettiPiece, t: number): { x: number; y: number; angle: number } {
  return { x: p.x0 + p.vx * t, y: START_Y + p.vy * t + GRAVITY * t * t, angle: p.rot + p.vr * t };
}
