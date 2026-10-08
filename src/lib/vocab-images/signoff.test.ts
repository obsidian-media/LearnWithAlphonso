import { describe, expect, it } from "vitest";
import { buildSignoff, signoffViolations, vocabImagesDigest } from "./signoff";
import { LICENSE_FOR_SOURCE, type VocabImageRecord } from "./types";

const img = (url: string, alt = "An apple."): VocabImageRecord => ({
  url,
  alt,
  credit: "C",
  source: "pexels",
  sourcePageUrl: "https://www.pexels.com/photo/x-1/",
  license: LICENSE_FOR_SOURCE.pexels,
  reviewedBy: "agent:a",
  reviewedAt: "2026-10-08",
});
const SET = { apple: img("u1"), pear: img("u2", "A pear.") };

describe("vocabImagesDigest", () => {
  it("ignores key order but changes with any url, alt, credit, source, page or license", () => {
    const d = vocabImagesDigest(SET);
    expect(vocabImagesDigest({ pear: SET.pear, apple: SET.apple })).toBe(d);
    expect(vocabImagesDigest({ ...SET, apple: img("u1b") })).not.toBe(d);
    expect(vocabImagesDigest({ ...SET, apple: img("u1", "Another apple.") })).not.toBe(d);
    expect(vocabImagesDigest({ ...SET, apple: { ...SET.apple, credit: "Someone Else" } })).not.toBe(
      d,
    );
    expect(vocabImagesDigest({ ...SET, apple: { ...SET.apple, source: "pixabay" } })).not.toBe(d);
    expect(
      vocabImagesDigest({
        ...SET,
        apple: { ...SET.apple, sourcePageUrl: "https://www.pexels.com/photo/y-2/" },
      }),
    ).not.toBe(d);
    expect(vocabImagesDigest({ ...SET, apple: { ...SET.apple, license: "other" } })).not.toBe(d);
  });
});

describe("buildSignoff / signoffViolations", () => {
  it("only the owner can sign off", () => {
    expect(() => buildSignoff(SET, "agent:x", "2026-10-10")).toThrow(/Shayan Salimi/);
  });

  it("passes for the signed-off set", () => {
    expect(signoffViolations(SET, buildSignoff(SET, "Shayan Salimi", "2026-10-10"))).toEqual([]);
  });

  it("fails with no sign-off, or after any change", () => {
    const s = buildSignoff(SET, "Shayan Salimi", "2026-10-10");
    expect(signoffViolations(SET, null)).toEqual([
      "no owner sign-off (scripts/vocab-images/signoff.json)",
    ]);
    expect(signoffViolations({ apple: SET.apple }, s)).toEqual([
      "sign-off covers 2 images, data has 1",
      "images changed since the owner signed off: rebuild the owner sheet and get a new sign-off",
    ]);
  });
});
