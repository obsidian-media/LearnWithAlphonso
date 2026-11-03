export type LessonRewardChip = { kind: "xp" | "streak" | "accuracy"; value: string; emoji: string };

/**
 * The reward chips on the lesson-complete screen. XP is always shown; the streak only when it is known
 * and above zero (an offline finish has no server progress yet); accuracy only when the lesson had
 * questions. Mirrors LessonRewards.chips in the Kit.
 */
export function lessonRewardChips({
  xp,
  streak,
  correct,
  total,
}: {
  xp: number;
  streak: number | null;
  correct: number;
  total: number;
}): LessonRewardChip[] {
  const chips: LessonRewardChip[] = [{ kind: "xp", value: `+${xp}`, emoji: "⭐" }];
  if (streak !== null && streak > 0)
    chips.push({ kind: "streak", value: `${streak}`, emoji: "🔥" });
  if (total > 0) {
    chips.push({ kind: "accuracy", value: `${Math.round((correct / total) * 100)}%`, emoji: "🎯" });
  }
  return chips;
}
