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

  // Pair-pack answers, which carried no tag until their packs' templates were
  // read as declarations (src/data/pair-answer-class.ts). Labelled here by how
  // each word reads in its own pack.
  //
  // Be clear about what this half of the sample proves, because the figure
  // flatters it: 36 of 36 tagged, 100% agreement. For a DECLARED word the label
  // below and the declaration are the same judgement written twice, so this
  // catches a wiring fault -- a declaration not reaching the map, the wrong pack,
  // a too-aggressive multi-word filter -- and NOT a wrong declaration. The checks
  // that can actually falsify a declaration are pair-pack-class.test.ts, which
  // requires a mixed pool to declare nothing, and pair-distractor-quality.test.ts,
  // which measures the output against a hand-written notion of shape vs. size.
  // The cloze half above remains a genuine accuracy check, because there the tag
  // comes from a tagger and the label does not.
  //
  // Four of these are the words bare-word tagging gets wrong, which is why they
  // are worth pinning: `square`, `circle`, `cube` and `eyes` all come back Verb
  // from `compromise` with no context.
  children: "Noun", // a1p1  Plural of "child"
  teeth: "Noun", // a1p1
  teacher: "Noun", // a1p12 Someone who "teaches students" is a…
  elephant: "Noun", // a1p13
  square: "Noun", // a1p15
  circle: "Noun", // a1p15
  cube: "Noun", // a1p15
  knife: "Noun", // a1p18 Which noun goes with "sharp"?
  eyes: "Noun", // a1p21
  happiness: "Noun", // b1p8  Noun form of "happy"
  analysis: "Noun", // b2p6
  take: "Verb", // a1p5  Which verb goes with "a shower"?
  went: "Verb", // a2p1  Past simple of "go"
  ascertain: "Verb", // c1p2  Formal equivalent of "find out"
  assert: "Verb", // c1p5  Which verb means "state something as true"?
  small: "Adjective", // a1p3  Opposite of "big"
  bigger: "Adjective", // a2p3  Comparative of "big"
  biggest: "Adjective", // a2p10
  huge: "Adjective", // a1p15
  meticulous: "Adjective", // c1p8  Which trait means "extremely careful"?
};

describe("ANSWER_POS", () => {
  it("agrees with hand-labelled ground truth on at least 80% of a known sample", () => {
    const labelled = Object.entries(HAND_LABELLED).filter(([word]) => ANSWER_POS[word]);
    const correct = labelled.filter(([word, expected]) => ANSWER_POS[word] === expected);
    expect(labelled.length).toBeGreaterThanOrEqual(10);
    expect(correct.length / labelled.length).toBeGreaterThanOrEqual(0.8);
  });

  it("does not tag as verbs the nouns that bare-word tagging calls verbs", () => {
    // This replaces a share-of-map proxy, and the replacement is the point.
    //
    // The old test required no tag to exceed 44%, chosen to sit just under the
    // 44.8%-Verb map that the bare-word generator produced. Declaring pair-pack
    // answers moves Noun to 45.7% (689 of 1507) while Verb FALLS to 30.8% from
    // ~37% -- so the guard fired on a change that moves the corpus away from the
    // failure it was built to detect. A bound that fires on an improvement is
    // measuring corpus composition, not correctness, and raising it until green
    // would have left a number that asserts nothing.
    //
    // So assert the failure by name. Each of these comes back Verb from
    // `compromise` with no context (measured 2026-09-24) and was tagged Verb by
    // that old map, which is precisely how it promoted nouns into verb slots.
    for (const word of ["square", "circle", "cube", "rock", "eyes"]) {
      expect(ANSWER_POS[word], `${word} tagged Verb -- has the generator gone bare-word?`).not.toBe(
        "Verb",
      );
    }
  });

  it("has not collapsed onto one tag", () => {
    // What survives of the dominance idea, at a bound that still asserts
    // something true: a corpus legitimately 46% nominal is fine, a generator
    // emitting one tag for everything is not. The named check above now carries
    // the job this used to do badly.
    const counts = Object.values(ANSWER_POS).reduce<Record<string, number>>((acc, tag) => {
      acc[tag] = (acc[tag] ?? 0) + 1;
      return acc;
    }, {});
    const total = Object.keys(ANSWER_POS).length;
    expect(total).toBeGreaterThan(500);
    for (const [tag, n] of Object.entries(counts)) {
      expect(n / total, `${tag} dominates the map`).toBeLessThan(0.6);
    }
  });

  it("drops a word that two packs class differently", () => {
    // `light` is a noun in a1p18 ("Which noun goes with 'not heavy'?") and an
    // adjective in a1p15 ("Something that 'is not heavy' is…"). Both are right,
    // so neither pack may win: the generator's agree-or-drop rule must discard
    // it rather than arbitrate. Absence here is load-bearing, not a gap -- it is
    // what stops a declaration overriding sentence evidence.
    expect(ANSWER_POS["light"]).toBeUndefined();
    expect(ANSWER_POS["leaves"]).toBeUndefined();
  });

  it("emits no empty key or tag", () => {
    // Renamed: a tag no longer implies a sentence. It means the word was either
    // read in a cloze sentence or declared by its pair pack's template, and that
    // every piece of evidence agreed.
    for (const [word, tag] of Object.entries(ANSWER_POS)) {
      expect(word.trim(), "empty key in ANSWER_POS").not.toBe("");
      expect(tag.trim(), `empty tag for ${word}`).not.toBe("");
    }
  });
});
