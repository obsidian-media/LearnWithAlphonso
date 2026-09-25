import { describe, expect, it } from "vitest";
import { curriculum } from "./curriculum";

/**
 * Hand-written, deliberately NOT read from ANSWER_POS or pair-answer-class.ts.
 *
 * If this set came from the same table the ranking reads, the test would pass
 * whenever the ranking obeyed the table -- including when the table is wrong.
 * These twelve are shapes because a person reading the pack says so.
 */
const A1P15_SHAPES = new Set([
  "triangle",
  "square",
  "circle",
  "rectangle",
  "pentagon",
  "hexagon",
  "oval",
  "octagon",
  "cube",
  "sphere",
  "cone",
  "cylinder",
]);

function packQuestions(packId: string) {
  return curriculum
    .flatMap((unit) => unit.lessons)
    .flatMap((lesson) => lesson.questions)
    .filter((q) => q.id.startsWith(`${packId}q`));
}

describe("a1p15 Shapes & Sizes offers distractors from the answer's own class", () => {
  it("has stopped giving the answer away to anyone who knows a shape from a size", () => {
    // The content audit's one deferred defect. a1p15 mixes shape nouns with size
    // adjectives, and its answers carried no part-of-speech tag (only cloze
    // sentences were tagged), so the ranking layer expressed no preference and
    // pool order decided.
    //
    // Measured 23 of 25 before pair answers were declared: "is a perfect cube
    // shape" offered [cube, huge, narrow, average] -- three of four choices were
    // size adjectives, so the question was answerable with no geometry at all.
    // After: 7 of 25, and the character changed too -- that question now offers
    // [cube, hexagon, long, sphere], which is a real question with one odd choice
    // rather than a free mark.
    //
    // The residual 7 is not noise: every one traces to `light` or `long`, the two
    // a1p15 answers the generator drops because another pack declares them a
    // different class (`light` is a noun in a1p18). The map is keyed by word
    // globally while distractors are always drawn within one pack, so a word
    // unambiguous inside a pack can still be dropped. Pack-scoping the map takes
    // this to zero and is recorded as the follow-up; the bound sits at the
    // measured figure so that work shows up here as an improvement rather than
    // having to move the number.
    let crossed = 0;
    const offenders: string[] = [];
    const questions = packQuestions("a1p15");
    for (const q of questions) {
      if (q.type !== "mc" && q.type !== "fill") continue;
      const choices = q.type === "mc" ? q.choices : q.bank;
      const answer = q.type === "mc" ? choices[q.answer]! : q.answer;
      const answerIsShape = A1P15_SHAPES.has(answer.toLowerCase());
      const wrongClass = choices.filter(
        (c) => c !== answer && A1P15_SHAPES.has(c.toLowerCase()) !== answerIsShape,
      );
      if (wrongClass.length) {
        crossed++;
        offenders.push(`${q.id} (${answer}): ${wrongClass.join(", ")}`);
      }
    }
    expect(questions.length, "a1p15 no longer has 25 questions -- ids have moved").toBe(25);
    expect(crossed, `cross-class distractors:\n  ${offenders.join("\n  ")}`).toBeLessThanOrEqual(7);
  });

  it("never offers three wrong-class choices at once", () => {
    // The specific shape of the original defect, and the one that makes a
    // question free: if every other choice is from the other class, the answer is
    // identifiable without knowing the material. This is the assertion that must
    // never regress, whatever the count above does.
    for (const q of packQuestions("a1p15")) {
      if (q.type !== "mc") continue;
      const answer = q.choices[q.answer]!;
      const answerIsShape = A1P15_SHAPES.has(answer.toLowerCase());
      const wrongClass = q.choices.filter(
        (c) => c !== answer && A1P15_SHAPES.has(c.toLowerCase()) !== answerIsShape,
      );
      expect(
        wrongClass.length,
        `${q.id} (${answer}) offers only wrong-class choices: ${q.choices.join(", ")}`,
      ).toBeLessThan(3);
    }
  });
});
