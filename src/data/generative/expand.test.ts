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

  it("produces one line per (subject, object) pair, deduplicated across verbs, when under the target count", () => {
    // 7 pronouns x 2 verbs x 2 nouns = 28 raw combinations, but exactly
    // one verb is pinned per (subject, object) pair -- see expand.ts's
    // dedup step (2026-09-22 final review finding C2) -- so 7 x 2 = 14
    // survive, not 28.
    const result = expandTemplate({
      template: svoPresent,
      vocab,
      packId: "test2",
      targetCount: 100,
    });
    expect(result.length).toBe(14);
    expect(new Set(result).size).toBe(14);
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

  // Regression test for a real finding from the final review (2026-09-22):
  // sorting the full combination list by hash(`${packId}-${i}`) is NOT a
  // shuffle -- FNV-1a lacks avalanche for strings differing only in a
  // short numeric suffix, so the chosen indices cluster into a few
  // contiguous runs (verified independently: for packId "a1gen1" over 252
  // combinations, the 25 lowest hash values were indices
  // 0,1,3,200-217,240,241,248,249 -- almost entirely one 36-wide block).
  // Because `build()` nests the FIRST slot (subject, for both pilot
  // templates) as the outermost loop, a contiguous index block means one
  // or two subjects only -- so 3 of 5 measured real packIds produced zero
  // he/she/it lines, meaning the pack never exercises the 3rd-person -s
  // agreement rule the whole pilot exists to test.
  it("represents every pronoun class when sampling down from a large combinatorial expansion", () => {
    const bigVocab: VocabEntry[] = [
      { word: "walk", pos: "verb", level: "A1", topics: ["test"] },
      { word: "run", pos: "verb", level: "A1", topics: ["test"] },
      { word: "eat", pos: "verb", level: "A1", topics: ["test"] },
      { word: "play", pos: "verb", level: "A1", topics: ["test"] },
      { word: "go", pos: "verb", level: "A1", topics: ["test"] },
      { word: "have", pos: "verb", level: "A1", topics: ["test"] },
      { word: "dog", pos: "noun", level: "A1", topics: ["test"] },
      { word: "school", pos: "noun", level: "A1", topics: ["test"] },
      { word: "coffee", pos: "noun", level: "A1", topics: ["test"] },
      { word: "book", pos: "noun", level: "A1", topics: ["test"] },
      { word: "music", pos: "noun", level: "A1", topics: ["test"] },
      { word: "shower", pos: "noun", level: "A1", topics: ["test"] },
    ];
    // 7 pronouns x 6 verbs x 6 nouns = 252 combinations, well over any
    // realistic targetCount -- forces real sampling every time.
    for (const packId of ["a1gen1", "a1gen2", "daily-routines", "routines7", "zzz"]) {
      const result = expandTemplate({
        template: svoPresent,
        vocab: bigVocab,
        packId,
        targetCount: 25,
      });
      // Compiled lines are capitalized (finding C3) -- "he" renders as
      // "He " at the start of a line, not "he ".
      const pronounsSeen = new Set(
        ["I", "You", "He", "She", "It", "We", "They"].filter((p) =>
          result.some((line) => line.startsWith(`${p} `)),
        ),
      );
      expect(
        pronounsSeen.size,
        `packId "${packId}" only covered pronouns: ${[...pronounsSeen].join(", ")}`,
      ).toBe(7);
    }
  });

  // Regression test for finding C2 (2026-09-22 final review): the same
  // rendered prompt ("he ___ dog.") used to appear multiple times with
  // different "correct" answers, since every verb in the pool was
  // combined with every (subject, object) pair. Each prompt (the part
  // before "|") must now be unique within one expansion.
  it("never produces the same prompt text with two different answers", () => {
    const result = expandTemplate({
      template: svoPresent,
      vocab,
      packId: "dedupe-check",
      targetCount: 100,
    });
    const prompts = result.map((line) => line.split("|")[0]);
    expect(new Set(prompts).size).toBe(prompts.length);
  });
});
