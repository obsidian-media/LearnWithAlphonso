import { describe, expect, it } from "vitest";
import { BANK } from "./lesson-bank";
import { HAND_LABELLED_PACKS, MIXED_POOL_PACKS } from "./pair-answer-class";

const pairPacks = Object.values(BANK)
  .flat()
  .filter((p) => p.kind === "pair");

function singleWordAnswers(packId: string): string[] {
  const pack = Object.values(BANK)
    .flat()
    .find((p) => p.id === packId);
  if (!pack) return [];
  return pack.data
    .split("\n")
    .map((l) => l.trim().split("|")[1]?.trim())
    .filter((a): a is string => !!a && !/\s/.test(a));
}

/**
 * Guards the hand labels, not the map generated from them.
 *
 * ANSWER_POS and PACK_ANSWER_POS are generated FROM these tables, so a test that
 * read them back to check the tables would agree by construction. The
 * expectations here are written from the packs' own content.
 *
 * A label applies to a whole pack's pool at once, so a careless one mis-ranks up
 * to 25 questions simultaneously. That asymmetry is why the table is small and
 * only covers pools that genuinely mix classes.
 */
describe("hand-labelled pair packs", () => {
  it("labels every single-word answer of a pack it labels at all", () => {
    // A half-labelled mixed pack is worse than an unlabelled one. rank() resolves
    // an untagged candidate to the ANSWER's class, so an unlabelled word in a
    // labelled pool is not passed over -- it is offered as a perfect match, and
    // the gaps become exactly the distractors that get promoted.
    for (const [packId, words] of Object.entries(HAND_LABELLED_PACKS)) {
      const answers = singleWordAnswers(packId);
      expect(answers.length, `${packId} has no single-word answers`).toBeGreaterThan(0);
      for (const answer of answers) {
        expect(words[answer], `${packId} labels no class for "${answer}"`).toBeDefined();
      }
    }
  });

  it("accounts for every pair pack whose pool mixes word classes", () => {
    // Hand-listed from the content. Each must be either labelled or recorded as
    // deliberately unlabelled, so that a mixed pack cannot sit unlabelled by
    // omission -- which is how a1p15 stayed broken through a whole content audit.
    for (const id of ["a1p15", "b1p5", "b2p2", "b1p1", "c1p1", "c1p18"]) {
      expect(
        pairPacks.some((p) => p.id === id),
        `${id} is no longer a pair pack`,
      ).toBe(true);
      expect(MIXED_POOL_PACKS[id], `${id} is a mixed pool with no recorded decision`).toBeDefined();
    }
  });

  it("labels the mixed packs it says are labelled, and only those", () => {
    for (const [packId, decision] of Object.entries(MIXED_POOL_PACKS)) {
      const labelled = packId in HAND_LABELLED_PACKS;
      expect(
        labelled,
        `${packId} is recorded as ${decision} but ${labelled ? "is" : "is not"} labelled`,
      ).toBe(decision === "labelled");
    }
    // And nothing is labelled that was never recorded as mixed: a uniform pool
    // cannot produce a cross-class distractor, so labelling one is dead weight
    // that can only introduce a mistake.
    for (const packId of Object.keys(HAND_LABELLED_PACKS)) {
      expect(MIXED_POOL_PACKS[packId], `${packId} is labelled but not recorded as mixed`).toBe(
        "labelled",
      );
    }
  });

  it("uses only class names the ranking layer compares", () => {
    // Ranking compares tag strings, so "noun" or "Nouns" would express a
    // preference that matches nothing while looking correct.
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
    for (const [packId, words] of Object.entries(HAND_LABELLED_PACKS)) {
      for (const [word, declared] of Object.entries(words)) {
        expect(valid.has(declared), `${packId}.${word} declares "${declared}"`).toBe(true);
      }
    }
  });

  it("labels a mixed pool with more than one class", () => {
    // A single-class label set means the pool was not actually mixed, so the
    // labels cannot change any ordering -- the mistake the first version of this
    // feature made across 22 packs.
    for (const [packId, words] of Object.entries(HAND_LABELLED_PACKS)) {
      const classes = new Set(Object.values(words));
      expect(
        classes.size,
        `${packId}'s labels are all ${[...classes][0]} -- no preference possible`,
      ).toBeGreaterThan(1);
    }
  });
});
