import { afterEach, describe, expect, it } from "vitest";
import { getCourse } from "@/data/courses";
import { deriveVocab } from "@/data/vocab";
import { VOCAB_IMAGES } from "@/data/vocab-images";
import { ROUNDS, drawRounds, imageWordPool, saidThePicture, sessionStars } from "./say-the-picture";

const added: string[] = [];
afterEach(() => {
  while (added.length) delete VOCAB_IMAGES[added.pop()!];
});

function firstImagelessTerm(course: "en" | "fr" | "es"): string {
  for (const unit of getCourse(course).curriculum)
    for (const lesson of unit.lessons)
      for (const item of deriveVocab(lesson))
        if (!item.image && /^[a-z]{4,}$/.test(item.term)) return item.term;
  throw new Error("no image-less term");
}

describe("the picture word pool", () => {
  it("draws only words that have an image, for each course", () => {
    for (const course of ["en", "fr", "es"] as const) {
      const pool = imageWordPool(course);
      expect(pool.length).toBeGreaterThan(8);
      expect(pool.every((w) => !!w.image?.url)).toBe(true);
    }
  });

  it("is derived from the LIVE image-having vocabulary: a newly image-tagged word appears, an untagged one leaves", () => {
    const term = firstImagelessTerm("en");
    expect(imageWordPool("en").some((w) => w.term === term)).toBe(false);
    const base = Object.values(VOCAB_IMAGES)[0];
    VOCAB_IMAGES[term.toLowerCase()] = { ...base, url: base.url.replace(/[^/]+\.jpg/, "new.jpg") };
    added.push(term.toLowerCase());
    expect(imageWordPool("en").some((w) => w.term === term)).toBe(true);
    delete VOCAB_IMAGES[term.toLowerCase()];
    expect(imageWordPool("en").some((w) => w.term === term)).toBe(false);
  });

  it("has no duplicate terms", () => {
    const terms = imageWordPool("es").map((w) => w.term.toLowerCase());
    expect(new Set(terms).size).toBe(terms.length);
  });
});

describe("drawing a session", () => {
  const pool = Array.from({ length: 30 }, (_, i) => i);
  it("is 8 distinct rounds", () => {
    const r = drawRounds(pool);
    expect(r).toHaveLength(ROUNDS);
    expect(ROUNDS).toBe(8);
    expect(new Set(r).size).toBe(8);
  });
  it("uses the whole pool when it is smaller than 8", () => {
    expect(drawRounds([1, 2, 3])).toHaveLength(3);
    expect(drawRounds([])).toEqual([]);
  });
  it("does not always draw the same words", () => {
    let calls = 0;
    const a = drawRounds(pool, 8, () => (calls++ % 7) / 7);
    const b = drawRounds(pool, 8, () => 0.99);
    expect(a).not.toEqual(b);
  });
});

describe("forgiving grading", () => {
  it("accepts the word, with an article, case and accents ignored", () => {
    expect(saidThePicture("Abogado.", "abogado", "es")).toBe(true);
    expect(saidThePicture("el abogado", "abogado", "es")).toBe(true);
    expect(saidThePicture("a dog", "dog", "en")).toBe(true);
    expect(saidThePicture("cafe", "café", "fr")).toBe(true);
  });
  it("rejects another word and never counts silence", () => {
    expect(saidThePicture("gato", "abogado", "es")).toBe(false);
    expect(saidThePicture("", "dog", "en")).toBe(false);
    expect(saidThePicture("um", "dog", "en")).toBe(false);
  });
  it("does not match a word inside a longer word", () => {
    expect(saidThePicture("hotdog", "dog", "en")).toBe(false);
  });
});

describe("session stars", () => {
  it("scale with first-time words but never go below one", () => {
    expect(sessionStars(8, 8)).toBe(3);
    expect(sessionStars(6, 8)).toBe(3);
    expect(sessionStars(4, 8)).toBe(2);
    expect(sessionStars(0, 8)).toBe(1);
    expect(sessionStars(0, 0)).toBe(1);
  });
});
