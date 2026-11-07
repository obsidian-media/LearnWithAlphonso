import { PERFECT_LESSON_BONUS, XP_PER_CORRECT, computeXpGain } from "./progress-math";

/**
 * The lesson's XP as the learner sees it, from the server's own formula (computeXpGain, paid by
 * computeLessonReplayXp on the complete-lesson path): each right answer is worth XP_PER_CORRECT, a lesson with every
 * answer right adds PERFECT_LESSON_BONUS, and a replay pays only what improves on the best earlier try. The verdict
 * sheet shows the per-answer part; the complete screen shows the parts that only exist at the end as their own
 * lines, so what is shown always adds up to what is awarded.
 */
export const XP_PER_RIGHT_ANSWER = XP_PER_CORRECT;

/** The most a lesson of `total` questions can pay: every answer right, perfect bonus included. */
export function maxLessonXp(total: number): number {
  return computeXpGain(total, total);
}

export type XpLine = {
  kind: "answers" | "perfect" | "earlier" | "regraded";
  label: string;
  xp: number;
};

/**
 * The complete screen's XP lines for `correct` of `total`, given what the server actually `awarded`. Pass the
 * server's own count of right answers (completeLessonRemote returns it): then the only difference between the
 * formula and the award is the replay rule, i.e. XP already earned on an earlier try of this lesson.
 */
export function lessonXpBreakdown({
  correct,
  total,
  awarded,
}: {
  correct: number;
  total: number;
  awarded: number;
}): { lines: XpLine[]; total: number } {
  const lines: XpLine[] = [
    {
      kind: "answers",
      label: `${correct} right answer${correct === 1 ? "" : "s"}`,
      xp: correct * XP_PER_CORRECT,
    },
  ];
  if (total > 0 && correct === total)
    lines.push({ kind: "perfect", label: "Perfect lesson", xp: PERFECT_LESSON_BONUS });
  const formula = lines.reduce((sum, l) => sum + l.xp, 0);
  if (awarded < formula)
    lines.push({
      kind: "earlier",
      label: "Already earned on an earlier try",
      xp: awarded - formula,
    });
  // With the server's own count, an award above the formula is a replay topping up a best score that was paid
  // less than it is worth today (an older completion row); never hidden, so the lines still add up.
  if (awarded > formula)
    lines.push({
      kind: "regraded",
      label: "Topped up to your best score",
      xp: awarded - formula,
    });
  return { lines, total: lines.reduce((sum, l) => sum + l.xp, 0) };
}

/**
 * The verdict sheet's "+N XP" for a right answer, or null for none. `rightSoFar` counts this answer; `previousBest`
 * is the learner's best earlier score on this lesson (null on a first try). A replay pays only what improves on that
 * best (computeLessonReplayXp), so a right answer shows XP only once the learner is past it: the chips never promise
 * XP the server will not pay, and they add up to the award's per-answer part.
 */
export function answerXpChip({
  rightSoFar,
  previousBest,
}: {
  rightSoFar: number;
  previousBest: number | null;
}): number | null {
  if (previousBest !== null && rightSoFar <= previousBest) return null;
  return XP_PER_RIGHT_ANSWER;
}
