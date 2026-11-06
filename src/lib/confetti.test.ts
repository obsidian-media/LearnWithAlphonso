import { describe, expect, it } from "vitest";
import { CONFETTI_COLOR_TOKENS, CONFETTI_SECONDS, confettiPieces, pieceAt } from "./confetti";

describe("confetti", () => {
  it("is about 90 pieces, the same every time for a seed, so a still frame is stable", () => {
    const a = confettiPieces(7, 393);
    expect(a).toHaveLength(90);
    expect(confettiPieces(7, 393)).toEqual(a);
    expect(confettiPieces(8, 393)).not.toEqual(a);
  });

  it("bursts from two points under the title, then falls below the room by the end", () => {
    const pieces = confettiPieces(7, 393);
    const origins = new Set(pieces.map((p) => Math.round(pieceAt(p, 0).x)));
    expect([...origins].sort((a, b) => a - b)).toEqual([
      Math.round(0.28 * 393),
      Math.round(0.72 * 393),
    ]);
    const atEnd = pieces.map((p) => pieceAt(p, CONFETTI_SECONDS).y);
    expect(Math.min(...atEnd)).toBeGreaterThan(400);
  });

  it("goes up first: the burst rises before gravity brings it down", () => {
    const p = confettiPieces(7, 393)[0];
    expect(pieceAt(p, 0.1).y).toBeLessThan(pieceAt(p, 0).y);
  });

  it("the still scatter (Reduce Motion) stays inside the room", () => {
    for (const p of confettiPieces(7, 393)) {
      expect(p.restX).toBeGreaterThanOrEqual(0);
      expect(p.restX).toBeLessThanOrEqual(393);
      expect(p.restY).toBeGreaterThanOrEqual(20);
      expect(p.restY).toBeLessThanOrEqual(320);
    }
  });

  it("colours come from the palette's tokens only: gold, kick gold, navy, robe blue, cream", () => {
    expect(CONFETTI_COLOR_TOKENS).toEqual([
      "--c-xp",
      "--c-on-hero-kick",
      "--c-brand",
      "--c-choice",
      "--c-card",
      "--c-xp-edge",
    ]);
    const used = new Set(confettiPieces(7, 393).map((p) => p.color));
    expect(used.size).toBe(CONFETTI_COLOR_TOKENS.length);
  });
});
