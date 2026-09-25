import { describe, expect, it } from "vitest";
import { getCourse } from "./courses";
import { ANSWER_POS, PACK_ANSWER_POS } from "./answer-pos";

/**
 * The effective class of a word for a given pack: a hand label if that pack has
 * one, otherwise the corpus-wide reading. Mirrors what distractor-affinity's
 * rank() actually consults, so this metric measures the ranking learners get
 * rather than one of its two inputs.
 */
function posIn(packId: string, word: string): string | undefined {
  return PACK_ANSWER_POS[packId]?.[word] ?? ANSWER_POS[word];
}

/**
 * Candidates that carry no class at all, bank-wide. Measured, then pinned.
 *
 * Not a quality target -- a tripwire on tag COVERAGE. rank() resolves an
 * untagged candidate to the answer's own class, so an untagged candidate is
 * offered as a perfect match. That makes losing tags a silent way to make
 * questions worse, and it makes the ratio below IMPROVE while it happens,
 * because an untagged candidate is skipped rather than counted as a mismatch.
 * Exactly that happened once: 12 words lost their tags, the ratio moved from
 * 0.0361 to 0.0269, and 43 questions across 11 packs got worse.
 *
 * Measured at 482 on this branch. Set AT the measured value, not above it, so
 * any future loss of coverage trips it rather than being absorbed by slack.
 */
const UNTAGGED_CANDIDATE_BUDGET = 482;

function choicesFor(key: string): string[] {
  const ref = getCourse("en").questionIndex[key];
  if (!ref) throw new Error(`question ${key} not found`);
  const q = ref.question;
  if (q.type === "mc") return q.choices;
  if (q.type === "fill") return q.bank;
  return [];
}

/**
 * Hand-labelled nouns from the money packs (a1p11 "Numbers & Money", b1p9
 * "Money & Shopping"). Written out by hand ON PURPOSE: these tests exist to
 * catch the ranking layer preferring nouns for verb slots, and grading that
 * with ANSWER_POS -- the same map the layer sorts by -- would only ever prove
 * the sort obeyed the map, never that the map is right. An earlier version of
 * this file made exactly that mistake and stayed green while the questions
 * below offered "card", "refund" and "guarantee" as verbs.
 */
const MONEY_NOUNS = [
  "money",
  "card",
  "wallet",
  "receipt",
  "tax",
  "coins",
  "notes",
  "balance",
  "amount",
  "discount",
  "sale",
  "refund",
  "guarantee",
  "fee",
  "debt",
  "budget",
  "allowance",
  "reviews",
  "deal",
  "rate",
  "terms",
];

describe("English distractor plausibility", () => {
  // Real defects found in the phase 1 content audit: a cloze pack pools every
  // answer regardless of word class, so a verb slot was offered nouns lifted
  // from the same pack. These are not wrong answers a learner has to think
  // about -- they are ungrammatical in the blank.
  it("offers no hand-labelled noun for the verb slot in a1p11q5", () => {
    // "I need to ___ some money for the trip." -> save
    const offered = choicesFor("a1p11l2:a1p11q5").filter((c) => MONEY_NOUNS.includes(c));
    expect(offered).toEqual([]);
  });

  it("offers no hand-labelled noun for the verb slot in b1p9q3", () => {
    // "He's ___ into debt because of his spending." -> falling
    const offered = choicesFor("b1p9l1:b1p9q3").filter((c) => MONEY_NOUNS.includes(c));
    expect(offered).toEqual([]);
  });

  it("offers no hand-labelled noun for the verb slot in b1p9q0", () => {
    // "I need to ___ some money before payday." -> budget (verb here)
    const offered = choicesFor("b1p9l1:b1p9q0").filter(
      (c) => MONEY_NOUNS.includes(c) && c !== "budget",
    );
    expect(offered).toEqual([]);
  });

  it("offers only nouns for the noun slot in a1p11q13", () => {
    // "The price includes ___." -> tax. Previously offered "withdraw"/"save".
    const verbs = ["withdraw", "save", "spent", "change"];
    const offered = choicesFor("a1p11l3:a1p11q13").filter((c) => verbs.includes(c));
    expect(offered).toEqual([]);
  });

  it("never repeats a prompt word back as a choice when alternatives exist", () => {
    // "The ___ melted quickly in the sun." used to offer "sun".
    expect(choicesFor("a1p10l5:a1p10q21")).not.toContain("sun");
  });

  it("keeps every question answerable, with the answer among its own choices", () => {
    for (const [key, ref] of Object.entries(getCourse("en").questionIndex)) {
      const q = ref.question;
      if (q.type === "mc") {
        expect(q.choices[q.answer], `${key} answer index out of range`).toBeDefined();
        expect(q.choices.length, `${key} has too few choices`).toBeGreaterThanOrEqual(2);
      }
      if (q.type === "fill") {
        expect(q.bank, `${key} answer missing from its own bank`).toContain(q.answer);
      }
    }
  });

  // Smoke test, not a quality guard. Both the sort key and this metric read
  // ANSWER_POS, so it can only detect the ranking layer being removed or
  // inverted -- it cannot see a wrong tag. Real quality evidence lives in the
  // hand-labelled assertions above and in answer-pos.test.ts.
  it("detects the ranking layer being disabled", () => {
    let mismatched = 0;
    let comparable = 0;
    let untagged = 0;
    for (const ref of Object.values(getCourse("en").questionIndex)) {
      const q = ref.question;
      if (q.type !== "mc") continue;
      const packId = q.id.replace(/q\d+$/, "");
      const answer = q.choices[q.answer];
      const answerPos = answer ? posIn(packId, answer) : undefined;
      if (!answerPos) continue;
      for (const choice of q.choices) {
        if (choice === answer) continue;
        const pos = posIn(packId, choice);
        if (!pos) {
          // Skipped by the ratio, but NOT harmless: rank() treats this as a
          // perfect match, so it is offered ahead of a known wrong-class word.
          // Counted separately so tag loss cannot hide in the denominator.
          untagged++;
          continue;
        }
        comparable++;
        if (pos !== answerPos) mismatched++;
      }
    }
    expect(comparable).toBeGreaterThan(500);
    expect(mismatched / comparable).toBeLessThan(0.2);
    expect(untagged, "tag coverage fell -- untagged candidates are PROMOTED").toBeLessThanOrEqual(
      UNTAGGED_CANDIDATE_BUDGET,
    );
  });
});
