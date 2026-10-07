import { describe, expect, it } from "vitest";
import {
  denylistHits,
  denylistViolations,
  hostViolations,
  imageabilityViolations,
  provenanceViolations,
  reviewStampViolations,
} from "./guards";
import type { ImageabilityData } from "./imageability";
import { publicUrlFor, storagePathFor } from "./paths";
import type { TermIndex } from "./terms";
import { LICENSE_FOR_SOURCE, type ImageLang, type VocabImageRecord } from "./types";

const good = (key: string, lang: "en" | "fr" | "es" = "en"): VocabImageRecord => ({
  url: publicUrlFor(storagePathFor(key, lang), "0123abcd"),
  alt: "A red apple on a wooden table.",
  credit: "Jane Doe",
  source: "pexels",
  sourcePageUrl: "https://www.pexels.com/photo/red-apple-590472/",
  license: LICENSE_FOR_SOURCE.pexels,
  reviewedBy: "agent:w1-review-r1-b001",
  reviewedAt: "2026-10-08",
});

describe("denylistHits", () => {
  it("matches whole words case-insensitively, not substrings", () => {
    expect(denylistHits("Woman in a BIKINI at the beach")).toEqual(["bikini"]);
    expect(denylistHits("A warm begun scrubbed drugstore shelf")).toEqual([]);
  });
});

describe("hostViolations", () => {
  it("passes a bucket URL at the key's own path", () => {
    expect(hostViolations({ apple: good("apple") })).toEqual([]);
  });

  it("flags a provider URL and a URL at another key's path", () => {
    const v = hostViolations({
      apple: { ...good("apple"), url: "https://pixabay.com/get/gabc_640.jpg" },
      pear: good("apple"),
    });
    expect(v).toHaveLength(2);
    expect(v[0]).toMatch(/^apple: url is not a vocab-images bucket URL/);
    expect(v[1]).toMatch(/^pear: url slug "apple" != expected "pear"/);
  });
});

describe("denylistViolations", () => {
  it("flags a denylisted word in alt or credit", () => {
    const v = denylistViolations({
      thick: { ...good("thick"), alt: "Plus size female in underwear on the floor" },
      x: { ...good("x"), credit: "Sexy Shots" },
    });
    expect(v).toEqual(['thick: alt contains "underwear"', 'x: credit contains "sexy"']);
  });
});

describe("reviewStampViolations", () => {
  it("passes a dated agent review, with or without a second pass", () => {
    expect(
      reviewStampViolations(
        {
          a: good("a"),
          b: { ...good("b"), reviewedBy: "agent:w1-review-r1-b001+agent:w1-review2-r1-b001" },
        },
        "2026-10-09",
      ),
    ).toEqual([]);
  });

  it("flags missing, malformed, pre-program and future stamps", () => {
    const v = reviewStampViolations(
      {
        a: { ...good("a"), reviewedBy: "" },
        b: { ...good("b"), reviewedAt: "08/10/2026" },
        c: { ...good("c"), reviewedAt: "2026-09-21" },
        d: { ...good("d"), reviewedAt: "2027-01-01" },
      },
      "2026-10-09",
    );
    expect(v).toEqual([
      'a: reviewedBy "" is not agent:<id>[+agent:<id>]',
      'b: reviewedAt "08/10/2026" is not YYYY-MM-DD',
      'c: reviewedAt "2026-09-21" predates the 2026-10-07 review program',
      'd: reviewedAt "2027-01-01" is in the future',
    ]);
  });
});

describe("provenanceViolations", () => {
  it("passes a consistent record", () => {
    expect(provenanceViolations({ apple: good("apple") })).toEqual([]);
  });

  it("flags license, page URL, alt and credit problems", () => {
    const v = provenanceViolations({
      a: { ...good("a"), license: LICENSE_FOR_SOURCE.pixabay },
      b: {
        ...good("b"),
        source: "pixabay",
        sourcePageUrl: "https://pixabay.com/get/gabc_640.jpg",
        license: LICENSE_FOR_SOURCE.pixabay,
      },
      c: { ...good("c"), alt: "Apple -- red" },
      d: { ...good("d"), alt: "" },
      e: { ...good("e"), credit: " " },
    });
    expect(v).toEqual([
      "a: license does not match source pexels",
      "b: sourcePageUrl is not a pixabay photo page: https://pixabay.com/get/gabc_640.jpg",
      'c: alt contains "--"',
      "d: alt must be 1-160 characters",
      "e: credit is empty",
    ]);
  });
});

describe("imageabilityViolations", () => {
  const DATA: ImageabilityData = {
    version: 1,
    imageable: {
      en: { noun: ["coin"], action: [], place: [], food: ["apple"] },
      fr: { noun: [], action: [], place: [], food: ["pomme"] },
      es: { noun: [], action: [], place: [], food: [] },
    },
    queries: { en: {}, fr: { pomme: "apple" }, es: {} },
    deny: { en: ["risk"], fr: [], es: [] },
    functionWords: { en: [], fr: [], es: [] },
  };
  const index: TermIndex = new Map([
    ["apple", { langs: new Set<ImageLang>(["en"]), meaning: "" }],
    ["coin", { langs: new Set<ImageLang>(["en", "fr"]), meaning: "" }],
    ["risk", { langs: new Set<ImageLang>(["en"]), meaning: "" }],
  ]);

  it("passes an imageable term in its own course", () => {
    expect(imageabilityViolations({ apple: good("apple") }, index, DATA)).toEqual([]);
  });

  it("flags a non-imageable term and a homograph shown in another course", () => {
    const v = imageabilityViolations({ risk: good("risk"), coin: good("coin") }, index, DATA);
    expect(v).toEqual([
      "risk: not imageable in en (denied)",
      "coin: also a fr vocab term, where it is not imageable (not-listed); the en picture would show on fr cards",
    ]);
  });
});
