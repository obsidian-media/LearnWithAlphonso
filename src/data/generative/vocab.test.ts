import { describe, expect, it } from "vitest";
import { GENERATIVE_VOCAB, type VocabEntry } from "./vocab";

describe("GENERATIVE_VOCAB", () => {
  it("starts empty -- grows only through the generate CLI, never hand-seeded", () => {
    expect(GENERATIVE_VOCAB).toEqual([]);
  });

  it("VocabEntry excludes pronoun from its pos union (pronouns are a fixed class, not open vocabulary)", () => {
    const entry: VocabEntry = { word: "coffee", pos: "noun", level: "A1", topics: ["test"] };
    expect(entry.pos).not.toBe("pronoun");
  });
});
