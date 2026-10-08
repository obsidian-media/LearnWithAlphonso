import { describe, expect, it } from "vitest";
import type { ImageabilityData } from "./imageability";
import {
  mergeClassification,
  type CandidateBatch,
  type ClassificationResult,
} from "./imageability-merge";

const base = (): ImageabilityData => ({
  version: 1,
  imageable: {
    en: { noun: [], action: [], place: [], food: [] },
    fr: { noun: [], action: [], place: [], food: [] },
    es: { noun: [], action: [], place: [], food: [] },
  },
  queries: { en: {}, fr: {}, es: {} },
  deny: { en: [], fr: [], es: [] },
  functionWords: { en: [], fr: [], es: [] },
});

const batch: CandidateBatch = {
  batch: "fr-01",
  lang: "fr",
  candidates: [
    { term: "pomme", key: "la pomme", meaning: "apple", enHint: null },
    { term: "gare", key: "gare", meaning: "train station", enHint: null },
    { term: "essayait", key: "essayait", meaning: "was trying", enHint: null },
  ],
};

const result = (over: Partial<ClassificationResult> = {}): ClassificationResult => ({
  batch: "fr-01",
  lang: "fr",
  noun: [],
  action: [],
  place: ["gare"],
  food: ["pomme"],
  deny: ["essayait"],
  queries: { pomme: "apple", gare: "train station" },
  ...over,
});

describe("mergeClassification", () => {
  it("merges a complete result into sorted lists", () => {
    const { data, problems } = mergeClassification(base(), batch, result());
    expect(problems).toEqual([]);
    expect(data.imageable.fr.food).toEqual(["pomme"]);
    expect(data.imageable.fr.place).toEqual(["gare"]);
    expect(data.deny.fr).toEqual(["essayait"]);
    expect(data.queries.fr).toEqual({ gare: "train station", pomme: "apple" });
  });

  it("refuses a result that skips, duplicates or invents terms", () => {
    const { problems } = mergeClassification(
      base(),
      batch,
      result({ food: ["pomme", "fromage"], deny: [], place: ["gare", "pomme"] }),
    );
    expect(problems).toEqual([
      'fr-01: "essayait" is not classified',
      'fr-01: "pomme" is classified more than once',
      'fr-01: "fromage" is not a candidate in this batch',
      'fr-01: imageable "fromage" has no English query',
    ]);
  });

  it("refuses an imageable fr/es term without a query, and a query on a denied term", () => {
    const { problems } = mergeClassification(
      base(),
      batch,
      result({ queries: { gare: "train station", essayait: "try" } }),
    );
    expect(problems).toContain('fr-01: imageable "pomme" has no English query');
    expect(problems).toContain('fr-01: query given for non-imageable "essayait"');
  });

  it("refuses a result for another batch or language", () => {
    expect(mergeClassification(base(), batch, result({ batch: "fr-02" })).problems).toEqual([
      "result is for batch fr-02, not fr-01",
    ]);
  });
});
