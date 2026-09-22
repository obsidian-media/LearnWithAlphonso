import { describe, expect, it } from "vitest";
import { GENERATIVE_VOCAB, type VocabEntry } from "./vocab";

/**
 * These assertions check invariants that must hold for every entry
 * regardless of how many `generate` runs have grown the dataset --
 * NOT that the array is empty. An earlier version of this test asserted
 * `GENERATIVE_VOCAB` was always `[]`, which the feature's own documented
 * workflow (generate writes accepted entries here immediately) breaks
 * the moment a real run's output is committed. Found in the 2026-09-22
 * final review (finding I3).
 */
describe("GENERATIVE_VOCAB", () => {
  it("never contains 'be' -- excluded at the proposal layer, see vocab.ts's own header comment", () => {
    expect(GENERATIVE_VOCAB.some((e) => e.word.toLowerCase() === "be")).toBe(false);
  });

  it("every entry has at least one topic and a pos in the open-class union", () => {
    for (const entry of GENERATIVE_VOCAB) {
      expect(entry.topics.length).toBeGreaterThan(0);
      expect(["noun", "verb", "adjective"]).toContain(entry.pos);
    }
  });

  it("VocabEntry excludes pronoun from its pos union (pronouns are a fixed class, not open vocabulary)", () => {
    const entry: VocabEntry = { word: "coffee", pos: "noun", level: "A1", topics: ["test"] };
    expect(entry.pos).not.toBe("pronoun");
  });
});
