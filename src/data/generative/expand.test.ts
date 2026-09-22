import { describe, expect, it } from "vitest";
import { expandTemplate } from "./expand";
import { TEMPLATES } from "./templates";
import type { VocabEntry } from "./vocab";

const vocab: VocabEntry[] = [
  { word: "walk", pos: "verb", level: "A1", topics: ["test"] },
  { word: "run", pos: "verb", level: "A1", topics: ["test"] },
  { word: "dog", pos: "noun", level: "A1", topics: ["test"] },
  { word: "school", pos: "noun", level: "A1", topics: ["test"] },
];

describe("expandTemplate", () => {
  const svoPresent = TEMPLATES.find((t) => t.id === "svo-present")!;

  it("returns an empty array when a required POS has no vocab at this level", () => {
    const result = expandTemplate({
      template: svoPresent,
      vocab: [],
      packId: "test1",
      targetCount: 10,
    });
    expect(result).toEqual([]);
  });

  it("produces every distinct combination when under the target count", () => {
    // 7 pronouns x 2 verbs x 2 nouns = 28 combinations
    const result = expandTemplate({
      template: svoPresent,
      vocab,
      packId: "test2",
      targetCount: 100,
    });
    expect(result.length).toBe(28);
    expect(new Set(result).size).toBe(28);
  });

  it("samples down to targetCount when combinatorial expansion overproduces", () => {
    const result = expandTemplate({
      template: svoPresent,
      vocab,
      packId: "test3",
      targetCount: 10,
    });
    expect(result.length).toBe(10);
  });

  it("is deterministic given the same packId", () => {
    const a = expandTemplate({ template: svoPresent, vocab, packId: "stable-id", targetCount: 10 });
    const b = expandTemplate({ template: svoPresent, vocab, packId: "stable-id", targetCount: 10 });
    expect(a).toEqual(b);
  });

  it("filters vocab by the template's own level, ignoring other-level entries", () => {
    const mixedLevelVocab: VocabEntry[] = [
      ...vocab,
      { word: "negotiate", pos: "verb", level: "C1", topics: ["test"] },
    ];
    const result = expandTemplate({
      template: svoPresent,
      vocab: mixedLevelVocab,
      packId: "test4",
      targetCount: 100,
    });
    expect(result.some((line) => line.includes("negotiate"))).toBe(false);
  });
});
