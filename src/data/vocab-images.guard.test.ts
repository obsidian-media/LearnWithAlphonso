import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VOCAB_IMAGES } from "./vocab-images";
import { FLAGGED_TERMS_2026_10_07 } from "../lib/vocab-images/flagged";
import {
  denylistViolations,
  hostViolations,
  imageabilityViolations,
  provenanceViolations,
  rejectedSourceViolations,
  reviewStampViolations,
} from "../lib/vocab-images/guards";
import { signoffViolations, vocabImagesDigest, type Signoff } from "../lib/vocab-images/signoff";
import { vocabTermIndex } from "../lib/vocab-images/terms";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SIGNOFF = path.join(ROOT, "scripts/vocab-images/signoff.json");
const REJECTED = path.join(ROOT, "scripts/vocab-images/rejected-sources.json");
const PASS1_KEYS = path.join(ROOT, "scripts/vocab-images/pass1-keys.json");
const PASS2_MIN = 315;
/**
 * Four first-pass images that the owner approved share a photo with an entry on
 * the rejected-sources list (the list recorded that photo as unusable for a
 * different term). They stay as signed off. The list is closed: a new image
 * may never come from a rejected photo, and none of these may be added to.
 */
const FIRST_PASS_BAN_OVERLAP = ["bombero", "passeport", "sugar", "waitress"];
const show = (v: string[]) => v.slice(0, 20).join("\n");

describe("VOCAB_IMAGES guards", () => {
  it("is not empty (a guard over zero entries proves nothing)", () => {
    expect(Object.keys(VOCAB_IMAGES).length).toBeGreaterThan(100);
  });

  it("has at least the 415 images of the first pass, plus the second pass", () => {
    expect(Object.keys(VOCAB_IMAGES).length).toBeGreaterThanOrEqual(415 + PASS2_MIN);
  });

  it("keeps every first-pass image exactly as the owner approved it", () => {
    const pass1 = JSON.parse(fs.readFileSync(PASS1_KEYS, "utf8")) as {
      count: number;
      keys: string[];
      digest: string;
    };
    expect(pass1.keys.length).toBe(415);
    const subset = Object.fromEntries(pass1.keys.map((k) => [k, VOCAB_IMAGES[k]]));
    expect(pass1.keys.filter((k) => !(k in VOCAB_IMAGES))).toEqual([]);
    expect(vocabImagesDigest(subset)).toBe(pass1.digest);
  });

  it("5. no image comes from a photo the review rejected", () => {
    const rejected = JSON.parse(fs.readFileSync(REJECTED, "utf8")) as Record<string, unknown>;
    expect(Object.keys(rejected).length).toBeGreaterThan(100);
    const pass1 = JSON.parse(fs.readFileSync(PASS1_KEYS, "utf8")) as { keys: string[] };
    expect(FIRST_PASS_BAN_OVERLAP.filter((k) => !pass1.keys.includes(k))).toEqual([]);
    const checked = Object.fromEntries(
      Object.entries(VOCAB_IMAGES).filter(([k]) => !FIRST_PASS_BAN_OVERLAP.includes(k)),
    );
    const v = rejectedSourceViolations(checked, rejected);
    expect(v, show(v)).toEqual([]);
    // the exemption is exact: these four, and nothing else, share a rejected photo
    const overlap = rejectedSourceViolations(VOCAB_IMAGES, rejected).map((x) => x.split(":")[0]);
    expect(overlap.sort()).toEqual([...FIRST_PASS_BAN_OVERLAP].sort());
  });

  it("1. every URL is the project's vocab-images bucket, at the term's own path", () => {
    const v = hostViolations(VOCAB_IMAGES);
    expect(v, show(v)).toEqual([]);
  });

  it("2. no alt text or credit contains a denylisted word", () => {
    const v = denylistViolations(VOCAB_IMAGES);
    expect(v, show(v)).toEqual([]);
  });

  it("3. every entry carries a review stamp", () => {
    const v = reviewStampViolations(VOCAB_IMAGES);
    expect(v, show(v)).toEqual([]);
  });

  it("source, license, photo page, alt and credit are consistent", () => {
    const v = provenanceViolations(VOCAB_IMAGES);
    expect(v, show(v)).toEqual([]);
  });

  it("4. every term with an image is imageable, in every course that shows it", () => {
    const v = imageabilityViolations(VOCAB_IMAGES, vocabTermIndex());
    expect(v, show(v)).toEqual([]);
  });

  it("no provider URL anywhere in the source or the native exports", () => {
    for (const rel of [
      "src/data/vocab-images.ts",
      "ios/LearnWithAlphonso/Resources/vocab-images.json",
      "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources/vocab-images.json",
      "android/LearnWithAlphonso/app/src/main/assets/content/vocab-images.json",
    ]) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      expect(text.includes("pixabay.com/get"), rel).toBe(false);
      expect(text.includes("images.pexels.com"), rel).toBe(false);
    }
  });

  it("none of the terms flagged on 2026-10-07 has an image", () => {
    expect(FLAGGED_TERMS_2026_10_07.filter((t) => t in VOCAB_IMAGES)).toEqual([]);
  });

  it("is exactly the set the owner signed off", () => {
    const signoff = fs.existsSync(SIGNOFF)
      ? (JSON.parse(fs.readFileSync(SIGNOFF, "utf8")) as Signoff)
      : null;
    const v = signoffViolations(VOCAB_IMAGES, signoff);
    expect(v, show(v)).toEqual([]);
  });
});
