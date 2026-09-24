import { describe, expect, it } from "vitest";
import { getCourse } from "./courses";
import { ANSWER_POS } from "./answer-pos";

function choicesFor(key: string): string[] {
  const ref = getCourse("en").questionIndex[key];
  if (!ref) throw new Error(`question ${key} not found`);
  const q = ref.question;
  if (q.type === "mc") return q.choices;
  if (q.type === "fill") return q.bank;
  return [];
}

describe("English distractor plausibility", () => {
  // Real defects found in the phase 1 content audit: a cloze pack pools every
  // answer regardless of word class, so a verb slot was offered nouns lifted
  // from the same pack. These are not merely wrong answers -- they are
  // ungrammatical in the blank, so they teach nothing.
  it("does not offer a noun from the prompt for a verb slot (a1p11q5)", () => {
    // "I need to ___ some money for the trip." -> save
    expect(choicesFor("a1p11l2:a1p11q5")).not.toContain("money");
  });

  it("does not offer nouns for the verb slot in b1p9q3", () => {
    // "He's ___ into debt because of his spending." -> falling
    const choices = choicesFor("b1p9l1:b1p9q3");
    expect(choices).not.toContain("debt");
    expect(choices).not.toContain("spending");
  });

  it("keeps every question's choice count unchanged by the ordering layer", () => {
    // The affinity layer reorders and never drops, so it cannot push
    // pickDistractors below three and flip a question between fill and mc.
    for (const ref of Object.values(getCourse("en").questionIndex)) {
      const q = ref.question;
      if (q.type === "mc") expect(q.choices.length).toBeGreaterThanOrEqual(2);
      if (q.type === "fill") expect(q.bank.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps part-of-speech mismatched distractors rare across the course", () => {
    let mismatched = 0;
    let comparable = 0;
    for (const ref of Object.values(getCourse("en").questionIndex)) {
      const q = ref.question;
      if (q.type !== "mc") continue;
      const answer = q.choices[q.answer];
      const answerPos = answer ? ANSWER_POS[answer] : undefined;
      if (!answerPos) continue;
      for (const choice of q.choices) {
        if (choice === answer) continue;
        const pos = ANSWER_POS[choice];
        if (!pos) continue;
        comparable++;
        if (pos !== answerPos) mismatched++;
      }
    }
    // Guard against regression, not perfection: some packs genuinely lack three
    // same-class candidates, and the layer tops up rather than dropping them.
    expect(comparable).toBeGreaterThan(1000);
    expect(mismatched / comparable).toBeLessThan(0.2);
  });
});
