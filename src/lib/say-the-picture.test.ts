import { afterEach, describe, expect, it } from "vitest";
import { getCourse } from "@/data/courses";
import { deriveVocab } from "@/data/vocab";
import { VOCAB_IMAGES } from "@/data/vocab-images";
import fs from "node:fs";
import path from "node:path";
import {
  MIN_POOL,
  ROUNDS,
  drawRounds,
  imageWordPool,
  saidThePicture,
  sessionStars,
} from "./say-the-picture";
import {
  imageLangOfUrl,
  isPicturable,
  pictureCategory,
  withPicturability,
} from "./vocab-images/picturable";
import { buildIOSVocabImagesBundle } from "./ios-content-export";

const ROOT = path.resolve(import.meta.dirname, "../..");
const COURSES = ["en", "fr", "es"] as const;
const POLICY = JSON.parse(
  fs.readFileSync(path.join(ROOT, "shared/say-the-picture-deny.json"), "utf8"),
) as { excludedCategories: string[]; deny: Record<"en" | "fr" | "es", string[]> };
/** The owner's build 72 list, verbatim: each of these pictures read as a different word. */
const OWNER_DENIED_EN = [
  "build",
  "card games",
  "contactless",
  "delivery",
  "empty",
  "field",
  "hiking",
  "nap",
  "sleeves",
  "sprinkle",
  "pollution",
  "shelves",
  "package",
  "actress",
  "rock",
];

const added: string[] = [];
afterEach(() => {
  while (added.length) delete VOCAB_IMAGES[added.pop()!];
});

/** An image-less term the pool would accept once it had a photo (a picturable noun, not an action or denied word). */
function firstImagelessTerm(course: "en" | "fr" | "es"): string {
  for (const unit of getCourse(course).curriculum)
    for (const lesson of unit.lessons)
      for (const item of deriveVocab(lesson))
        if (!item.image && /^[a-z]{4,}$/.test(item.term) && isPicturable(item.term, course))
          return item.term;
  throw new Error("no image-less picturable term");
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

describe("which pictures Say the Picture may use (build 72: confusing pictures)", () => {
  it("the shared file is the owner's list, and only the action category is excluded", () => {
    expect([...POLICY.deny.en].sort()).toEqual([...OWNER_DENIED_EN].sort());
    expect(POLICY.excludedCategories).toEqual(["action"]);
  });

  it("the pool holds no action word and no denied word, in any course", () => {
    for (const course of COURSES) {
      const denied = new Set(POLICY.deny[course]);
      for (const w of imageWordPool(course)) {
        expect(pictureCategory(w.term, course), `${course}:${w.term}`).toBeDefined();
        expect(pictureCategory(w.term, course), `${course}:${w.term}`).not.toBe("action");
        const bare = w.term
          .toLowerCase()
          .replace(/^(?:the|a|an|el|la|los|las|un|una|le|les|des|l')\s?/, "");
        expect(denied.has(w.term.toLowerCase()) || denied.has(bare), `${course}:${w.term}`).toBe(
          false,
        );
      }
    }
  });

  it("the filter really bites: owner-listed words with a photo are out of the English pool", () => {
    const inPool = new Set(imageWordPool("en").map((w) => w.term.toLowerCase()));
    let withPhoto = 0;
    for (const term of OWNER_DENIED_EN) {
      const key = Object.keys(VOCAB_IMAGES).find((k) => k.replace(/^(?:a|an|the) /, "") === term);
      if (key) withPhoto++;
      expect(inPool.has(term), term).toBe(false);
      if (key) expect(isPicturable(key, "en"), key).toBe(false);
    }
    // A pool that excluded nothing would pass the lines above only if none of the words had a photo.
    expect(withPhoto).toBeGreaterThanOrEqual(10);
    // And the action category alone removes a real share of the words that have a photo.
    const imaged = new Set<string>();
    for (const unit of getCourse("en").curriculum)
      for (const lesson of unit.lessons)
        for (const i of deriveVocab(lesson)) if (i.image) imaged.add(i.term.toLowerCase());
    expect(imageWordPool("en").length).toBeLessThan(imaged.size - 100);
  });

  it("a denied word is excluded even when its category is a good one, and a good noun stays", () => {
    expect(isPicturable("rock", "en")).toBe(false);
    expect(isPicturable("the rock", "en")).toBe(false);
    expect(isPicturable("dog", "en")).toBe(true);
    expect(isPicturable("hiking", "en")).toBe(false);
    // Not listed at all: nothing vouches for the picture.
    expect(isPicturable("zzzz-not-a-word", "en")).toBe(false);
  });

  it("keeps the activity open in every course (MIN_POOL guard)", () => {
    for (const course of COURSES) {
      expect(imageWordPool(course).length).toBeGreaterThanOrEqual(MIN_POOL);
    }
    expect(MIN_POOL).toBe(4);
  });

  it("the native bundle carries the same answer: what the apps draw is exactly the web pool", () => {
    const bundle = buildIOSVocabImagesBundle();
    for (const [key, image] of Object.entries(bundle)) {
      expect(typeof image.picturable, key).toBe("boolean");
      if (image.picturable) {
        expect(image.category, key).toBeDefined();
        expect(image.category, key).not.toBe("action");
      }
    }
    for (const course of COURSES) {
      const nativeRule = new Set<string>();
      for (const unit of getCourse(course).curriculum)
        for (const lesson of unit.lessons)
          for (const item of deriveVocab(lesson)) {
            const entry = bundle[item.term.trim().toLowerCase()];
            if (entry && entry.picturable !== false) nativeRule.add(item.term.trim().toLowerCase());
          }
      const web = new Set(imageWordPool(course).map((w) => w.term.trim().toLowerCase()));
      expect([...nativeRule].sort(), course).toEqual([...web].sort());
    }
  });

  it("the committed native bundles are the export's output (regenerate with scripts/export-*-content.ts)", () => {
    const expected = JSON.parse(JSON.stringify(buildIOSVocabImagesBundle())) as unknown;
    for (const rel of [
      "ios/LearnWithAlphonso/Resources/vocab-images.json",
      "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources/vocab-images.json",
      "android/LearnWithAlphonso/app/src/main/assets/content/vocab-images.json",
    ]) {
      const onDisk = JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")) as unknown;
      expect(onDisk, rel).toEqual(expected);
    }
  });

  it("bakes the language from the photo's own path, and refuses a photo with none", () => {
    expect(imageLangOfUrl("https://x.test/storage/v1/object/public/vocab-images/fr/a.jpg")).toBe(
      "fr",
    );
    expect(imageLangOfUrl("https://x.test/other/a.jpg")).toBeUndefined();
    const base = Object.values(VOCAB_IMAGES)[0];
    expect(() => withPicturability({ x: { ...base, url: "https://x.test/a.jpg" } })).toThrow();
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
