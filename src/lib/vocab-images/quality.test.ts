import { describe, expect, it } from "vitest";
import type { ManifestEntry } from "./manifest";
import { scoreVocabImageCandidates } from "./quality";

function entry(key: string, overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return {
    key,
    lang: "en",
    slug: key,
    query: key,
    meaning: key,
    category: "noun",
    status: "fetched",
    attempts: 1,
    rejectedSourceIds: [],
    candidate: {
      source: "pexels",
      sourceId: key,
      sourcePageUrl: `https://example.test/${key}`,
      credit: "Photographer",
      providerAlt: "A clear photo of the item",
      stagingPath: `staging/en/${key}.jpg`,
      sha8: key.padEnd(8, "0").slice(0, 8),
      width: 1200,
      height: 900,
    },
    review: {
      reviewedBy: "agent:test",
      reviewedAt: "2026-10-20",
      alt: "item",
      peopleVisible: false,
    },
    ...overrides,
  };
}

describe("scoreVocabImageCandidates", () => {
  it("ranks metadata risks, low dimensions, missing review, and duplicate hashes", () => {
    const duplicate = entry("apple");
    duplicate.candidate!.sha8 = "shared00";
    const repeated = entry("pear");
    repeated.candidate!.sha8 = "shared00";
    repeated.candidate!.width = 250;
    repeated.candidate!.height = 1000;
    repeated.candidate!.providerAlt = " ";
    repeated.review = undefined;

    const scores = scoreVocabImageCandidates([entry("good"), duplicate, repeated]);
    expect(scores[0]).toMatchObject({ key: "pear", score: 0, duplicateOf: "apple" });
    expect(scores[0].flags).toEqual(
      expect.arrayContaining([
        "small-image",
        "extreme-aspect-ratio",
        "missing-provider-description",
        "duplicate-image-hash",
        "not-visually-reviewed",
      ]),
    );
    expect(scores.at(-1)).toMatchObject({ key: "good", score: 100, flags: [] });
  });

  it("ignores entries without fetched candidate metadata", () => {
    expect(scoreVocabImageCandidates([entry("pending", { candidate: undefined })])).toEqual([]);
  });
});
