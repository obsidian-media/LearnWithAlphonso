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
  reviewStampViolations,
} from "../lib/vocab-images/guards";
import { signoffViolations, type Signoff } from "../lib/vocab-images/signoff";
import { vocabTermIndex } from "../lib/vocab-images/terms";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SIGNOFF = path.join(ROOT, "scripts/vocab-images/signoff.json");
const show = (v: string[]) => v.slice(0, 20).join("\n");

describe("VOCAB_IMAGES guards (B1, B2 image guards)", () => {
  it("is not empty (a guard over zero entries proves nothing)", () => {
    expect(Object.keys(VOCAB_IMAGES).length).toBeGreaterThan(100);
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
