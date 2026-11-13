import { describe, expect, it } from "vitest";
import { BANK_ES } from "./lesson-bank-es";
import { BANK_FR } from "./lesson-bank-fr";
import { packQuestions } from "./bank-engine";
import { withReviewFix } from "./review-fixes";

// What this guards (docs/CONTENT-PLAYBOOK.md, section 2, "Explanations"): the generated line
// '"x" is correct here. <pack note>' says nothing about the sentence in front of the learner. The
// engine still writes it for every fill-in line, and the content review replaced it one fix at a
// time; this gate holds the count at zero so a new fill-in line cannot ship it.

const GENERIC = /is correct here/i;

function built() {
  const out: { id: string; explanation: string }[] = [];
  for (const [lang, bank] of [
    ["fr", BANK_FR],
    ["es", BANK_ES],
  ] as const)
    for (const level of ["A1", "A2", "B1", "B2", "C1"] as const)
      for (const pack of bank[level])
        for (const q of packQuestions(pack)) {
          const fixed = withReviewFix(lang, q);
          out.push({ id: fixed.id, explanation: fixed.explanation ?? "" });
        }
  return out;
}

describe("French and Spanish explanations", () => {
  const all = built();

  it("covers the whole bank (the gate has not gone blind)", () => {
    expect(all.length).toBeGreaterThan(6000);
  });

  it('no question ends with the bare "x is correct here" explanation', () => {
    const bad = all.filter((q) => GENERIC.test(q.explanation)).map((q) => q.id);
    expect(bad).toEqual([]);
  });

  it("the pattern does catch the generated line (the gate can fail)", () => {
    expect(GENERIC.test('"droite" is correct here. Everyday vocabulary for directions.')).toBe(
      true,
    );
    expect(GENERIC.test('"droite" means right; "gauche" is left.')).toBe(false);
  });
});
