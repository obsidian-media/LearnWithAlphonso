import { describe, expect, it } from "vitest";
import {
  mergeVocabEntries,
  formatVocabEntryAsTs,
  replaceVocabArrayInSource,
} from "./generative-vocab-authoring";
import type { VocabEntry } from "../data/generative/vocab";

describe("mergeVocabEntries", () => {
  it("appends a genuinely new (word, pos) entry", () => {
    const existing: VocabEntry[] = [
      { word: "coffee", pos: "noun", level: "A1", topics: ["cafe"] },
    ];
    const merged = mergeVocabEntries(existing, [
      { word: "walk", pos: "verb", level: "A1", topics: ["daily"] },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find((e) => e.word === "walk")?.topics).toEqual(["daily"]);
  });

  it("unions topics into an existing entry instead of duplicating it", () => {
    const existing: VocabEntry[] = [
      { word: "coffee", pos: "noun", level: "A1", topics: ["cafe"] },
    ];
    const merged = mergeVocabEntries(existing, [
      { word: "coffee", pos: "noun", level: "A1", topics: ["daily", "cafe"] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.topics).toEqual(["cafe", "daily"]);
  });

  it("treats word matching as case-insensitive but keys on (word, pos)", () => {
    const existing: VocabEntry[] = [
      { word: "Coffee", pos: "noun", level: "A1", topics: ["cafe"] },
    ];
    const merged = mergeVocabEntries(existing, [
      { word: "coffee", pos: "verb", level: "A1", topics: ["odd"] },
    ]);
    // same word text, different pos -> a distinct entry, not merged
    expect(merged).toHaveLength(2);
  });

  it("does not mutate the input arrays", () => {
    const existing: VocabEntry[] = [
      { word: "coffee", pos: "noun", level: "A1", topics: ["cafe"] },
    ];
    const existingCopy = JSON.parse(JSON.stringify(existing));
    mergeVocabEntries(existing, [
      { word: "coffee", pos: "noun", level: "A1", topics: ["daily"] },
    ]);
    expect(existing).toEqual(existingCopy);
  });
});

describe("formatVocabEntryAsTs", () => {
  it("renders a plain entry as a TS object literal", () => {
    const rendered = formatVocabEntryAsTs({
      word: "coffee",
      pos: "noun",
      level: "A1",
      topics: ["cafe", "daily"],
    });
    expect(rendered).toContain('word: "coffee"');
    expect(rendered).toContain('pos: "noun"');
    expect(rendered).toContain('level: "A1"');
    expect(rendered).toContain('topics: ["cafe", "daily"]');
    expect(rendered).not.toContain("irregularForms");
  });

  it("includes irregularForms only when present", () => {
    const rendered = formatVocabEntryAsTs({
      word: "go",
      pos: "verb",
      level: "A1",
      topics: ["daily"],
      irregularForms: { presentThirdPerson: "goes", past: "went" },
    });
    expect(rendered).toContain("irregularForms: { presentThirdPerson: \"goes\", past: \"went\" }");
  });
});

describe("replaceVocabArrayInSource", () => {
  const fakeSource = `import type { Level } from "../levels";

export type VocabEntry = { word: string };

export const GENERATIVE_VOCAB: VocabEntry[] = [
];
`;

  it("splices entries into the GENERATIVE_VOCAB array without touching the rest of the file", () => {
    const entries: VocabEntry[] = [{ word: "coffee", pos: "noun", level: "A1", topics: ["cafe"] }];
    const updated = replaceVocabArrayInSource(fakeSource, entries);
    expect(updated).toContain('export type VocabEntry = { word: string };');
    expect(updated).toContain('word: "coffee"');
  });

  it("produces valid-looking output with an empty entries array (no dangling comma/brace)", () => {
    const updated = replaceVocabArrayInSource(fakeSource, []);
    expect(updated).toContain("export const GENERATIVE_VOCAB: VocabEntry[] = [\n];");
  });

  it("throws a clear error if the marker isn't found", () => {
    expect(() => replaceVocabArrayInSource("no marker here", [])).toThrow(/could not find/);
  });
});
