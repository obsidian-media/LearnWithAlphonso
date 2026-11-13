import { describe, expect, it } from "vitest";
import { activeLineIndex, timedLinesFor, type TimedLine } from "./podcast-timings";

const L = (s: number, t: string, p = false): TimedLine => ({ s, t, p });
const lines = [L(0, "One.", true), L(4, "Two."), L(9.5, "Three.", true), L(20, "Four.")];

describe("activeLineIndex", () => {
  it("is -1 for no lines", () => expect(activeLineIndex([], 5)).toBe(-1));
  it("is the first line before and at the first start", () => {
    expect(activeLineIndex(lines, 0)).toBe(0);
    expect(activeLineIndex(lines, -3)).toBe(0);
  });
  it("is the last line whose start is at or before the time", () => {
    expect(activeLineIndex(lines, 3.99)).toBe(0);
    expect(activeLineIndex(lines, 4)).toBe(1);
    expect(activeLineIndex(lines, 9.49)).toBe(1);
    expect(activeLineIndex(lines, 9.5)).toBe(2);
    expect(activeLineIndex(lines, 19.9)).toBe(2);
  });
  it("is the last line at and after the end", () => {
    expect(activeLineIndex(lines, 20)).toBe(3);
    expect(activeLineIndex(lines, 9999)).toBe(3);
  });
  it("treats a non-finite time as the start", () => {
    expect(activeLineIndex(lines, Number.NaN)).toBe(0);
  });
  it("matches a linear scan over many lines", () => {
    const many = Array.from({ length: 200 }, (_, i) => L(i * 1.7, `l${i}`));
    for (let t = -1; t < 360; t += 0.37) {
      let want = 0;
      many.forEach((l, i) => {
        if (l.s <= t) want = i;
      });
      expect(activeLineIndex(many, t)).toBe(want);
    }
  });
});

describe("timedLinesFor", () => {
  const transcript = "One. Two.\n\nThree. Four.";
  it("returns the lines when they spell exactly the transcript", () => {
    expect(timedLinesFor({ lines }, transcript)).toEqual(lines);
  });
  it("ignores whitespace and newline differences", () => {
    expect(timedLinesFor({ lines }, "One.   Two.\nThree.\n\nFour.")).toEqual(lines);
  });
  it("returns null when the transcript was edited after alignment", () => {
    expect(timedLinesFor({ lines }, "One. Two. Three. Fourth.")).toBeNull();
  });
  it("returns null with no entry, no transcript or no lines", () => {
    expect(timedLinesFor(undefined, transcript)).toBeNull();
    expect(timedLinesFor({ lines }, null)).toBeNull();
    expect(timedLinesFor({ lines: [] }, transcript)).toBeNull();
  });
  it("returns null when starts go backwards", () => {
    const bad = [L(5, "One."), L(2, "Two."), L(9, "Three."), L(12, "Four.")];
    expect(timedLinesFor({ lines: bad }, transcript)).toBeNull();
  });
});
