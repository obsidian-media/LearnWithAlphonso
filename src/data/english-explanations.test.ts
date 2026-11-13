import { describe, expect, it } from "vitest";
import { getCourse } from "./courses";
import { explainChoice } from "./lesson-bank";

/**
 * No English explanation is the bare '"x" is correct here.' line (docs/CONTENT-PLAYBOOK.md section 2):
 * it says nothing about THIS answer. The English bank (lesson-bank.ts) now builds a real reason for
 * every multiple-choice and fill line: the bracketed clue, the pack's rule, or the finished sentence.
 * French and Spanish have their own engine (bank-engine.ts) and their own gate.
 */
describe("English explanations give a reason", () => {
  const questions = getCourse("en").curriculum.flatMap((u) =>
    u.lessons.flatMap((l) => l.questions),
  );

  it("none says only that the answer is correct here", () => {
    const bare = questions.filter((q) => /is correct here/i.test(q.explanation ?? ""));
    expect(bare.map((q) => q.id).slice(0, 20), `${bare.length} questions`).toEqual([]);
  });

  describe("explainChoice", () => {
    it("uses the bracketed clue as the reason", () => {
      expect(
        explainChoice(
          "coat",
          "Put on your ___ before you go out. (a warm layer over your clothes)",
          "x",
        ),
      ).toBe(
        'The clue "a warm layer over your clothes" points to "coat"; the other options do not fit it.',
      );
    });

    it("quotes a pack note that states a rule", () => {
      const out = explainChoice(
        "on",
        "See you ___ Monday.",
        "Use in for months, on for days, at for times.",
      );
      expect(out).toContain('"on"');
      expect(out).toContain("Use in for months, on for days, at for times.");
    });

    it("gives way to the finished sentence when the note only names the topic", () => {
      const out = explainChoice(
        "cart",
        "Push the ___ down the aisle.",
        "Everyday vocabulary for grocery shopping.",
      );
      expect(out).toBe(
        '"cart" completes the sentence "Push the cart down the aisle."; the other options do not make sense there.',
      );
      expect(out).not.toMatch(/is correct here/i);
    });
  });
});
