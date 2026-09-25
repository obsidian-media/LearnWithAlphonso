import { describe, expect, it } from "vitest";
import { ANSWER_POS, PACK_ANSWER_POS } from "./answer-pos";

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

  // Deliberately NOT extended with pair-pack answers.
  //
  // An earlier version of this branch added 20 of them and reported "36 of 36,
  // 100%". Two things were wrong with that. Those words are tagged from a hand
  // label, so the label here and the table there are one judgement written twice
  // -- the check could only fail on a wiring fault, never on a wrong label. And
  // adding them DILUTED this test: the threshold is a ratio, so allowed failures
  // went from floor(16*0.2)=3 to floor(36*0.2)=7, meaning four of the sixteen
  // genuine tagger labels could regress with this still green. A sample that
  // cannot fail does not merely add nothing, it subtracts from the sample that
  // can.
  //
  // What guards the hand labels instead: pair-pack-class.test.ts (a labelled
  // pool must be genuinely mixed and fully labelled) and
  // pair-distractor-quality.test.ts (the output, against an independent
  // hand-written notion of shape vs. size).
};

describe("ANSWER_POS", () => {
  it("agrees with hand-labelled ground truth on at least 80% of a known sample", () => {
    const labelled = Object.entries(HAND_LABELLED).filter(([word]) => ANSWER_POS[word]);
    const correct = labelled.filter(([word, expected]) => ANSWER_POS[word] === expected);
    expect(labelled.length).toBeGreaterThanOrEqual(10);
    expect(correct.length / labelled.length).toBeGreaterThanOrEqual(0.8);
  });

  it("does not tag as verbs the nouns that bare-word tagging calls verbs", () => {
    // ADDED alongside the share-of-map check below, not in place of it, because
    // that check turns out not to catch the thing it was built for.
    //
    // Reconstructed the failure to find out: tagging every single-word answer in
    // the bank from the bare word gives 1,541 entries peaking at **41.0% Verb**
    // -- under the 44% bound, so the old guard passes a full bare-word
    // regression. (ARCHITECTURE.md cites 44.8% for the map that actually
    // shipped; the reconstruction lands lower, which only makes the bound
    // looser than it looks.) The threshold was calibrated against one historical
    // artifact and does not generalise.
    //
    // This assertion names the failure instead. Every word here comes back Verb
    // from `compromise` with no context, and the shipped bad map tagged them that
    // way, which is exactly how it promoted nouns into verb slots. They are all
    // cloze answers, so they are genuinely in this map and this genuinely bites --
    // an earlier draft named `square`, `circle`, `cube`, `rock` and `eyes`, which
    // are pair-pack answers and absent from ANSWER_POS entirely, so
    // `undefined !== "Verb"` passed whatever the generator did.
    for (const word of ["card", "refund", "balance", "discount", "tax"]) {
      expect(ANSWER_POS[word], `${word} is tagged Verb -- has the generator gone bare-word?`).toBe(
        "Noun",
      );
    }
  });

  it("is not dominated by a single tag", () => {
    // Kept at 44%, unchanged. An earlier version of this branch loosened it to
    // 60% because pair declarations pushed Noun to 45.7% -- but those
    // declarations were withdrawn (they could not affect any ordering, and their
    // side effects degraded 43 questions), so the map is byte-identical to before
    // and the original bound holds with room to spare. Recorded because loosening
    // a bound to make a change pass is a move worth being suspicious of, and the
    // right answer here was to withdraw the change, not the bound.
    //
    // Left in place as a coarse collapse tripwire. It does NOT catch a bare-word
    // regression -- see the named check above, and the 41.0% measurement there.
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

  it("lets one word be a noun corpus-wide and an adjective inside a1p15", () => {
    // The whole reason hand labels live in a separate, pack-scoped map, and it
    // took a regression to learn it.
    //
    // `light` is a noun in the cloze sentence "Turn off the ___ before you sleep."
    // (lesson-bank.ts:1100) and again in "In ___ of the above" (:3804), so the
    // corpus map reads Noun -- correctly. In a1p15 the clue is "is not heavy",
    // where it is an adjective -- also correctly.
    //
    // Put the label in ANSWER_POS and those two readings collide, so agree-or-drop
    // discards `light` everywhere. That is not the neutral abstention it sounds
    // like: rank() resolves an untagged candidate to the ANSWER's class, so a
    // dropped word is offered as a perfect match. `light` was offered as a
    // preposition in 8 of c1p20's questions that way. Scoped, both readings stand
    // and nothing outside a1p15 moves at all.
    expect(ANSWER_POS["light"], "corpus reading, from two cloze sentences").toBe("Noun");
    expect(PACK_ANSWER_POS["a1p15"]?.["light"], "a1p15's reading").toBe("Adjective");
    // The override shadows per word, it does not replace the map: a1p15 carries
    // no opinion about words it never mentions.
    expect(PACK_ANSWER_POS["a1p15"]?.["money"]).toBeUndefined();
  });

  it("emits no empty key or tag", () => {
    // Absence means "no preference" and must stay meaningful: a tag is only
    // emitted when the word was seen inside a cloze sentence and every occurrence
    // agreed. Hand labels are emitted separately, into PACK_ANSWER_POS.
    for (const [word, tag] of Object.entries(ANSWER_POS)) {
      expect(word.trim(), "empty key in ANSWER_POS").not.toBe("");
      expect(tag.trim(), `empty tag for ${word}`).not.toBe("");
    }
  });
});
