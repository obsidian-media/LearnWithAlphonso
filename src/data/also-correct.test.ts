import { describe, expect, it } from "vitest";
import { getCourse } from "./courses";
import { alsoCorrectReason, clearlyWrongFor } from "./also-correct";

/**
 * A wrong answer must be wrong. The bank draws distractors from other lines of
 * the same pack, so a distractor can make a perfectly good sentence: "They ___
 * at home." offered "study", and "They study at home." is correct English, so a
 * learner could be marked wrong for a right answer.
 *
 * The fixtures below are written by hand and do NOT go through the detector's own
 * tables for their verdicts: each one is a sentence a teacher would accept (or
 * reject), with the reason, so the detector is graded by someone other than itself.
 */
const ALSO_CORRECT: [prompt: string, answer: string, wrong: string][] = [
  ["They ___ at home.", "are", "study"],
  // Not covered, on purpose: lexical-for-lexical swaps ("We ___ English every day",
  // study vs speak) need word meaning, which this detector does not have. They are
  // sized by hand in docs/content-audit-2026-11.md.
  ["We ___ breakfast together.", "have", "had"],
  ["He ___ not eat meat.", "does", "did"],
  ["___ you see the film?", "Did", "Do"],
  ["My phone ___ working.", "isn't", "is"],
  ["___ I open the window, please?", "may", "can"],
  ["I think it ___ rain.", "will", "won't"],
  ["They ___ at home.", "are", "were"],
  ["The cat is sitting ___ the table.", "under", "behind"],
  ["The cafe is ___ the station.", "opposite", "beside"],
];

const GENUINELY_WRONG: [prompt: string, answer: string, wrong: string][] = [
  ["They ___ at home.", "are", "is"],
  ["They ___ at home.", "are", "isn't"],
  ["They ___ at home.", "are", "am"],
  ["I ___ a student.", "am", "does"],
  ["She ___ cooking when I arrived.", "was", "were"],
  ["She ___ cooking when I arrived.", "was", "is"],
  ["They ___ not come to the party yesterday.", "did", "do"],
  ["He ___ not eat meat.", "does", "do"],
  ["I think it ___ rain.", "will", "starts"],
  ["She ___ a car.", "has", "have"],
  ["It ___ cold today.", "is", "opens"],
  ["The cat is sitting ___ the table.", "under", "during"],
  ["I paid ___ cash.", "in", "by"],
  // A tag question must echo the main verb, so only one auxiliary fits.
  ["They were at the party, ___ they?", "weren't", "wasn't"],
  ["She doesn't like tea very much, ___ she?", "does", "did"],
];

describe("alsoCorrectReason (hand-written verdicts)", () => {
  for (const [prompt, answer, wrong] of ALSO_CORRECT) {
    it(`flags "${wrong}" in "${prompt}" (answer "${answer}")`, () => {
      expect(alsoCorrectReason(prompt, answer, wrong)).not.toBeNull();
    });
  }
  for (const [prompt, answer, wrong] of GENUINELY_WRONG) {
    it(`accepts "${wrong}" in "${prompt}" (answer "${answer}")`, () => {
      expect(alsoCorrectReason(prompt, answer, wrong)).toBeNull();
    });
  }
});

describe("clearlyWrongFor", () => {
  it("offers only forms the detector accepts as wrong, for a be slot", () => {
    const wrongs = clearlyWrongFor("They ___ at home.", "are");
    expect(wrongs.length).toBeGreaterThanOrEqual(2);
    for (const w of wrongs) expect(alsoCorrectReason("They ___ at home.", "are", w)).toBeNull();
    expect(wrongs).not.toContain("are");
  });
});

describe("the English bank", () => {
  const course = getCourse("en");
  const hits: string[] = [];
  for (const unit of course.curriculum)
    for (const lesson of unit.lessons)
      for (const q of lesson.questions) {
        if (q.type !== "mc" && q.type !== "fill") continue;
        if (!q.prompt.includes("___")) continue;
        const answer = q.type === "mc" ? q.choices[q.answer]! : q.answer;
        const options = q.type === "mc" ? q.choices : q.bank;
        for (const o of options) {
          if (o === answer) continue;
          const why = alsoCorrectReason(q.prompt, answer, o);
          if (why)
            hits.push(`${lesson.id}:${q.id} "${q.prompt}" answer=${answer} wrong=${o} (${why})`);
        }
      }

  it("offers no wrong answer that also makes a correct sentence", () => {
    expect(hits).toEqual([]);
  });
});
