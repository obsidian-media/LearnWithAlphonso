import { describe, expect, it } from "vitest";
import { MIN_KEEP, keepPathsFromImages, planPrune } from "./prune";
import { publicUrlFor, storagePathFor } from "./paths";
import { LICENSE_FOR_SOURCE, type VocabImageRecord } from "./types";

const rec = (key: string): VocabImageRecord => ({
  url: publicUrlFor(storagePathFor(key, "en"), "0123abcd"),
  alt: "An object.",
  credit: "C",
  source: "pexels",
  sourcePageUrl: "https://www.pexels.com/photo/x-1/",
  license: LICENSE_FOR_SOURCE.pexels,
  reviewedBy: "agent:review-r1-b001",
  reviewedAt: "2026-10-08",
});
const keys = Array.from({ length: MIN_KEEP }, (_, i) => `term${String(i).padStart(3, "0")}`);
const images = Object.fromEntries(keys.map((k) => [k, rec(k)]));
const keep = keepPathsFromImages(images);

describe("keepPathsFromImages", () => {
  it("maps each bucket URL to its object path and skips anything else", () => {
    const paths = keepPathsFromImages({
      a: rec("a"),
      b: { ...rec("b"), url: "https://x.test/b.jpg" },
    });
    expect([...paths]).toEqual(["en/a.jpg"]);
  });
});

describe("planPrune", () => {
  const listed = [...keep];

  it("lists only the true orphans", () => {
    expect(planPrune([...listed, "en/orphan-a.jpg", "fr/orphan-b.jpg"], keep)).toEqual([
      "en/orphan-a.jpg",
      "fr/orphan-b.jpg",
    ]);
  });

  it("refuses an empty keep-set (a missing manifest or data must never delete everything)", () => {
    expect(() => planPrune(listed, new Set())).toThrow(/refusing/);
  });

  it("refuses a small keep-set", () => {
    expect(() => planPrune(listed, new Set(["en/term000.jpg"]))).toThrow(/refusing/);
  });

  it("refuses to delete more than 10% of the bucket unless forced", () => {
    const many = Array.from({ length: 20 }, (_, i) => `en/stale-${i}.jpg`);
    expect(() => planPrune([...listed, ...many], keep)).toThrow(/--force-large/);
    expect(planPrune([...listed, ...many], keep, { forceLarge: true })).toHaveLength(20);
  });
});
