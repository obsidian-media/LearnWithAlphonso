import { describe, expect, it } from "vitest";
import { PERFECT_LESSON_BONUS, computeLessonReplayXp, computeXpGain } from "./progress-math";
import { XP_PER_RIGHT_ANSWER, answerXpChip, lessonXpBreakdown, maxLessonXp } from "./lesson-xp";

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
      // The sum alone cannot fail: a reconciling line absorbs any gap. So pin the parts too. The right-answers line
      // is exactly the "+N XP" the verdict sheet showed per right answer, and a first try needs no reconciling line
      // at all: per-answer XP plus the perfect bonus IS the award.
      expect(b.lines[0]).toMatchObject({ kind: "answers", xp: c.correct * XP_PER_RIGHT_ANSWER });
      if (c.existing === null)
        expect(b.lines.map((l) => l.kind)).toEqual(
          c.correct === c.total ? ["answers", "perfect"] : ["answers"],
        );
    });
  }

  it("still adds up when a replay tops up a best score paid less than it is worth today", () => {
    // An older completion row: 7 right but paid nothing. A 2-right replay pays the whole best (70), above its own 20.
    const awarded = computeLessonReplayXp({ correct: 7, xpEarned: 0 }, 2, 8).xpGain;
    expect(awarded).toBe(70);
    const b = lessonXpBreakdown({ correct: 2, total: 8, awarded });
    expect(shownTotal(b)).toBe(70);
    expect(b.lines.at(-1)).toMatchObject({ kind: "regraded", xp: 50 });
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

describe("the per-answer chip never promises XP the server will not pay", () => {
  it("a first try shows +10 on every right answer", () => {
    for (let right = 1; right <= 8; right++)
      expect(answerXpChip({ rightSoFar: right, previousBest: null })).toBe(XP_PER_RIGHT_ANSWER);
  });

  it("a replay shows nothing until the learner passes their best earlier score", () => {
    expect(answerXpChip({ rightSoFar: 5, previousBest: 6 })).toBeNull();
    expect(answerXpChip({ rightSoFar: 6, previousBest: 6 })).toBeNull();
    expect(answerXpChip({ rightSoFar: 7, previousBest: 6 })).toBe(XP_PER_RIGHT_ANSWER);
    // A perfect best leaves nothing to earn per answer.
    expect(answerXpChip({ rightSoFar: 8, previousBest: 8 })).toBeNull();
  });

  // Every answer pattern of a 6-question lesson, against every earlier best: the chips the learner saw add up to
  // exactly the per-answer part of the award (the award less any perfect bonus, which the complete screen shows on
  // its own line), so they never overstate it.
  it("over every answer pattern and earlier best, the chips add up to the award's per-answer part", () => {
    const total = 6;
    for (let best = -1; best <= total; best++) {
      const existing = best < 0 ? null : { correct: best, xpEarned: computeXpGain(best, total) };
      for (let mask = 0; mask < 1 << total; mask++) {
        let right = 0;
        let shown = 0;
        for (let i = 0; i < total; i++) {
          if (!(mask & (1 << i))) continue;
          right++;
          shown +=
            answerXpChip({ rightSoFar: right, previousBest: existing?.correct ?? null }) ?? 0;
        }
        const awarded = computeLessonReplayXp(existing, right, total).xpGain;
        const perfectPaid =
          right === total && (existing?.correct ?? -1) < total ? PERFECT_LESSON_BONUS : 0;
        expect(shown).toBe(awarded - perfectPaid);
      }
    }
  });
});
