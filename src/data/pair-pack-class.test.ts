import { describe, expect, it } from "vitest";
import { BANK } from "./lesson-bank";
import { DECLARED_BY_PACK, DECLARED_BY_TEMPLATE } from "./pair-answer-class";

const pairPacks = Object.values(BANK)
  .flat()
  .filter((p) => p.kind === "pair");

/**
 * Guards the DECLARATION, not the generated map.
 *
 * ANSWER_POS is generated FROM these tables, so any test that reads it to check
 * them would agree by construction -- the failure mode this repo keeps hitting.
 * The expectations here are hand-written from the packs' own content.
 *
 * A declared class applies to a whole pack at once, so one wrong declaration
 * mis-tags up to 25 answers simultaneously, and every one of them then promotes
 * wrong-class distractors. That asymmetry is why "declares nothing" is a safe
 * answer and a confident wrong answer is not.
 */
describe("pair templates declare a class their content can satisfy", () => {
  it("declares nothing for a pack whose pool genuinely mixes classes", () => {
    // Hand-listed by reading the pools, not derived from anything:
    //   a1p15 shape nouns + size adjectives (the content audit's open defect)
    //   b1p5  mostly nouns, but holds "agree"; "touch"/"work" read either way
    //   b2p2  cross-class ON PURPOSE -- affect/effect, its/it's, principle/principal
    //   b1p1  gloss phrases
    //   c1p1  gloss phrases
    //   c1p18 adjectives ("unemployed") alongside nouns ("prison")
    for (const id of ["a1p15", "b1p5", "b2p2", "b1p1", "c1p1", "c1p18"]) {
      const pack = pairPacks.find((p) => p.id === id);
      expect(pack, `${id} is no longer a pair pack -- revisit this list`).toBeDefined();
      expect(
        DECLARED_BY_TEMPLATE[pack!.prompt ?? ""] ?? null,
        `${id} must declare no word class: its pool holds more than one`,
      ).toBe(null);
    }
  });

  it("classifies every pair template, as a class or an explicit null", () => {
    // Absence from the table and an explicit null behave identically in the
    // generator, so this exists to make the choice deliberate: a newly authored
    // pack fails here until someone has decided what its answers are.
    for (const pack of pairPacks) {
      expect(
        Object.prototype.hasOwnProperty.call(DECLARED_BY_TEMPLATE, pack.prompt ?? ""),
        `${pack.id}'s template is unclassified -- decide and add it: ${pack.prompt}`,
      ).toBe(true);
    }
  });

  it("only declares classes the ranking layer understands", () => {
    // A typo ("noun") would silently express a preference that matches nothing,
    // since ranking compares tag strings.
    const valid = new Set([
      "Verb",
      "Adjective",
      "Adverb",
      "Preposition",
      "Pronoun",
      "Determiner",
      "Conjunction",
      "Value",
      "Noun",
    ]);
    for (const [template, declared] of Object.entries(DECLARED_BY_TEMPLATE)) {
      if (declared === null) continue;
      expect(valid.has(declared), `${template} declares unknown class "${declared}"`).toBe(true);
    }
    for (const [packId, words] of Object.entries(DECLARED_BY_PACK)) {
      for (const [word, declared] of Object.entries(words)) {
        expect(valid.has(declared), `${packId}.${word} declares "${declared}"`).toBe(true);
      }
    }
  });

  it("labels every answer of a pack it labels per-word", () => {
    // A partially labelled mixed pack is worse than an unlabelled one: the
    // labelled half gets a preference and the unlabelled half is treated as
    // same-class-as-anything, so the gaps become the distractors that get
    // promoted. If a pack is worth labelling by hand, it is worth finishing.
    for (const [packId, words] of Object.entries(DECLARED_BY_PACK)) {
      const pack = Object.values(BANK)
        .flat()
        .find((p) => p.id === packId);
      expect(pack, `${packId} no longer exists`).toBeDefined();
      const answers = pack!.data
        .split("\n")
        .map((l) => l.trim().split("|")[1]?.trim())
        .filter((a): a is string => !!a && !/\s/.test(a));
      for (const answer of answers) {
        expect(words[answer], `${packId} labels no class for "${answer}"`).toBeDefined();
      }
    }
  });
});
