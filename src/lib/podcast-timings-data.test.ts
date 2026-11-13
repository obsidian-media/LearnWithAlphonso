import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import data from "../data/podcast-timings.json";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const WEB = read("src/data/podcast-timings.json");

describe("podcast timing data", () => {
  it("is byte-identical in the iOS and Android bundles", () => {
    expect(read("ios/LearnWithAlphonso/Sources/PodcastTimings.json")).toBe(WEB);
    expect(read("android/LearnWithAlphonso/app/src/main/assets/podcast-timings.json")).toBe(WEB);
  });

  const entries = Object.entries(
    data as Record<string, { lines: { s: number; t: string; p: boolean }[] }>,
  );

  it("has episodes keyed by uuid, each with timed lines", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, entry] of entries) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(entry.lines.length).toBeGreaterThan(5);
      expect(entry.lines[0]!.p).toBe(true);
    }
  });

  it("never goes backwards, starts at the beginning and has real text in every line", () => {
    for (const [id, entry] of entries) {
      expect(entry.lines[0]!.s, id).toBeLessThan(2);
      entry.lines.forEach((l, i) => {
        expect(l.t.trim().length, `${id} line ${i}`).toBeGreaterThan(0);
        if (i > 0) expect(l.s, `${id} line ${i}`).toBeGreaterThanOrEqual(entry.lines[i - 1]!.s);
      });
    }
  });
});
