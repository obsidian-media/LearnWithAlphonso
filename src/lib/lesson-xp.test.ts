import { describe, expect, it } from "vitest";
import { computeLessonReplayXp, computeXpGain } from "./progress-math";
import { XP_PER_RIGHT_ANSWER, lessonXpBreakdown, maxLessonXp } from "./lesson-xp";

/** Sums every line the complete screen shows: what the learner reads must add up to what they get. */
const shownTotal = (b: ReturnType<typeof lessonXpBreakdown>) =>
  b.lines.reduce((sum, line) => sum + line.xp, 0);

describe("lesson XP, shown per answer", () => {
  it("each right answer is worth exactly the server formula's per-answer part", () => {
    for (let correct = 0; correct <= 8; correct++) {
      // Below a perfect lesson the formula is all per-answer.
      if (correct < 8) expect(computeXpGain(correct, 8)).toBe(correct * XP_PER_RIGHT_ANSWER);
    }
  });

  it("start's 'up to' is the formula's maximum: every answer right, perfect bonus included", () => {
    expect(maxLessonXp(8)).toBe(computeXpGain(8, 8));
    expect(maxLessonXp(5)).toBe(computeXpGain(5, 5));
  });

  // The lines on the complete screen (right answers, perfect bonus, already earned) must add up to the XP the
  // server awards (computeLessonReplayXp, the complete-lesson path) in every case.
  const CASES: {
    name: string;
    existing: { correct: number; xpEarned: number } | null;
    correct: number;
    total: number;
  }[] = [
    { name: "first try, one miss", existing: null, correct: 7, total: 8 },
    { name: "first try, perfect", existing: null, correct: 8, total: 8 },
    { name: "first try, all wrong", existing: null, correct: 0, total: 8 },
    { name: "replay that improves", existing: { correct: 5, xpEarned: 50 }, correct: 8, total: 8 },
    {
      name: "replay that does not improve",
      existing: { correct: 8, xpEarned: 100 },
      correct: 6,
      total: 8,
    },
    { name: "replay, same score", existing: { correct: 6, xpEarned: 60 }, correct: 6, total: 8 },
  ];
  for (const c of CASES) {
    it(`the lines add up to the server's award: ${c.name}`, () => {
      const awarded = computeLessonReplayXp(c.existing, c.correct, c.total).xpGain;
      const b = lessonXpBreakdown({ correct: c.correct, total: c.total, awarded });
      expect(shownTotal(b)).toBe(awarded);
      expect(b.total).toBe(awarded);
    });
  }

  it("still adds up when the server's own grading counted more right answers than this screen", () => {
    const b = lessonXpBreakdown({ correct: 6, total: 8, awarded: 70 });
    expect(shownTotal(b)).toBe(70);
  });

  it("names the parts: right answers, the perfect bonus, and XP already earned on an earlier try", () => {
    expect(lessonXpBreakdown({ correct: 8, total: 8, awarded: 100 }).lines).toEqual([
      { kind: "answers", label: "8 right answers", xp: 80 },
      { kind: "perfect", label: "Perfect lesson", xp: 20 },
    ]);
    expect(lessonXpBreakdown({ correct: 6, total: 8, awarded: 0 }).lines).toEqual([
      { kind: "answers", label: "6 right answers", xp: 60 },
      { kind: "earlier", label: "Already earned on an earlier try", xp: -60 },
    ]);
    expect(lessonXpBreakdown({ correct: 1, total: 8, awarded: 10 }).lines).toEqual([
      { kind: "answers", label: "1 right answer", xp: 10 },
    ]);
  });
});
