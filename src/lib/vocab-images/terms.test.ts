import { describe, expect, it } from "vitest";
import type { ImageabilityData } from "./imageability";
import { planImageableTerms, vocabTermIndex, type TermIndex } from "./terms";

const DATA: ImageabilityData = {
  version: 1,
  imageable: {
    en: { noun: ["radio", "coin"], action: [], place: [], food: ["apple"] },
    fr: { noun: [], action: [], place: [], food: ["pomme", "pain"] },
    es: { noun: ["radio"], action: [], place: [], food: [] },
  },
  queries: { en: {}, fr: { pomme: "apple", pain: "bread" }, es: { radio: "radio" } },
  deny: { en: [], fr: [], es: [] },
  functionWords: { en: [], fr: [], es: [] },
};

const index = (entries: [string, ("en" | "fr" | "es")[], string][]): TermIndex =>
  new Map(entries.map(([key, langs, meaning]) => [key, { langs: new Set(langs), meaning }]));

describe("planImageableTerms", () => {
  const plan = planImageableTerms(
    index([
      ["apple", ["en"], "a fruit"],
      ["pomme", ["fr"], "apple"],
      ["radio", ["en", "es"], "a radio"],
      ["pain", ["en", "fr"], "hurt / bread"],
      ["coin", ["en", "fr"], "money / corner"],
      ["freedom", ["en"], "abstract"],
    ]),
    DATA,
  );
  const byKey = new Map(plan.planned.map((p) => [p.key, p]));

  it("plans imageable terms with their language, query and meaning", () => {
    expect(byKey.get("apple")).toMatchObject({
      lang: "en",
      query: "apple",
      category: "food",
      meaning: "a fruit",
    });
    expect(byKey.get("pomme")).toMatchObject({ lang: "fr", query: "apple" });
  });

  it("keeps a shared key only when every course agrees on the picture", () => {
    expect(byKey.get("radio")).toMatchObject({ lang: "en", query: "radio" });
  });

  it("drops a homograph that is imageable in one course but not another", () => {
    expect(byKey.has("pain")).toBe(false);
    expect(byKey.has("coin")).toBe(false);
    expect(plan.skipped).toContainEqual({
      key: "pain",
      reason: "cross-language conflict (en: not-listed)",
    });
    expect(plan.skipped).toContainEqual({
      key: "coin",
      reason: "cross-language conflict (fr: not-listed)",
    });
  });

  it("skips non-imageable terms with the per-course reasons", () => {
    expect(plan.skipped).toContainEqual({ key: "freedom", reason: "en: not-listed" });
  });

  it("honours restrictTo", () => {
    const restricted = planImageableTerms(
      index([["apple", ["en"], "a fruit"]]),
      DATA,
      new Set(["pomme"]),
    );
    expect(restricted.planned).toEqual([]);
  });
});

describe("vocabTermIndex (real curriculum)", () => {
  const real = vocabTermIndex();

  it("records the course of every vocab term, including the doctor imageKey", () => {
    expect(real.get("doctor")?.langs.has("en")).toBe(true);
  });

  it("indexes the first French lesson's terms under fr", () => {
    expect(real.get("bonjour")?.langs.has("fr")).toBe(true);
    expect(real.get("au revoir")?.langs.has("fr")).toBe(true);
  });
});
