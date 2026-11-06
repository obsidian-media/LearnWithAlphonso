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
 * The complete screen's XP lines for `correct` of `total`, given what the server actually `awarded`. The difference
 * between the formula and the award is XP already earned on an earlier try of this lesson (the replay rule).
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
  // The server re-grades every answer itself; if it counted more right than this screen did, its count wins.
  if (awarded > formula)
    lines.push({
      kind: "regraded",
      label: "More right answers on the server's grading",
      xp: awarded - formula,
    });
  return { lines, total: lines.reduce((sum, l) => sum + l.xp, 0) };
}
