// Deno copy of src/lib/srs.ts's pure functions (minus deriveAnswerCorrectness,
// which needs the DB-row question shape here rather than the in-process
// Question type -- see index.ts). Supabase Edge Functions bundle each
// function directory independently, so a relative import reaching outside
// supabase/functions/grade-review/ is not reliably resolvable -- same
// reasoning as complete-lesson/progress-math.ts. Keep in sync with the
// source of truth.

export type ReviewGradeInput = {
  correct: boolean;
  ease: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  /** See src/lib/srs.ts's ReviewGradeInput.elapsedDays doc comment -- keep
   * this Deno copy in sync with that file. */
  elapsedDays: number;
};

export type ReviewGradeResult = {
  retired: boolean;
  ease: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
};

const MIN_EASE = 1.3;
const MAX_EASE = 2.8;
const EASE_STEP_DOWN = 0.2;
const EASE_STEP_UP = 0.15;
const RETIRE_AFTER_REPETITIONS = 4;
const MAX_OVERDUE_GROWTH_BONUS = 1.5;
const LAPSE_REPETITIONS_RETENTION = 0.5;

export function computeReviewGrade(input: ReviewGradeInput): ReviewGradeResult {
  const ease = input.correct
    ? Math.min(MAX_EASE, input.ease + EASE_STEP_UP)
    : Math.max(MIN_EASE, input.ease - EASE_STEP_DOWN);

  if (!input.correct) {
    const repetitions = Math.floor(input.repetitions * LAPSE_REPETITIONS_RETENTION);
    const intervalDays =
      repetitions === 0 ? 1 : repetitions === 1 ? 3 : Math.round(input.intervalDays * ease) || 6;
    return { retired: false, ease, intervalDays, repetitions, lapses: input.lapses + 1 };
  }

  const repetitions = input.repetitions + 1;
  if (repetitions >= RETIRE_AFTER_REPETITIONS) {
    return {
      retired: true,
      ease,
      repetitions,
      intervalDays: input.intervalDays,
      lapses: input.lapses,
    };
  }

  if (repetitions === 1) return { retired: false, ease, repetitions, intervalDays: 1, lapses: input.lapses };
  if (repetitions === 2) return { retired: false, ease, repetitions, intervalDays: 3, lapses: input.lapses };

  const overdueBonus = input.intervalDays > 0
    ? Math.min(MAX_OVERDUE_GROWTH_BONUS, Math.max(1, input.elapsedDays / input.intervalDays))
    : 1;
  const intervalDays = Math.round(input.intervalDays * ease * overdueBonus) || 6;
  return { retired: false, ease, repetitions, intervalDays, lapses: input.lapses };
}

export type ReviewOutcome =
  | { retired: true; dueOn: string }
  | {
      retired: false;
      dueOn: string;
      ease: number;
      intervalDays: number;
      repetitions: number;
      lapses: number;
    };

export function computeReviewOutcome(
  input: ReviewGradeInput,
  today: string,
  addDays: (days: number) => string,
): ReviewOutcome {
  const grade = computeReviewGrade(input);
  if (grade.retired) return { retired: true, dueOn: today };
  const dueOn = input.correct ? addDays(grade.intervalDays) : today;
  return {
    retired: false,
    dueOn,
    ease: grade.ease,
    intervalDays: grade.intervalDays,
    repetitions: grade.repetitions,
    lapses: grade.lapses,
  };
}
