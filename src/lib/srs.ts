/** Pure SM-2-style grading extracted from review.functions.ts, so it can be
 * unit tested without a database. The handler still owns reading/writing
 * rows and computing the actual due date from `intervalDays`. */

export type ReviewGradeInput = {
  correct: boolean;
  ease: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
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

/**
 * Wrong answer: reset the item to the start and record a lapse. Correct
 * answer: grow the interval (1 day, then 3, then interval * ease), and
 * retire the item once it's been answered correctly 4 times running.
 */
export function computeReviewGrade(input: ReviewGradeInput): ReviewGradeResult {
  if (!input.correct) {
    return {
      retired: false,
      ease: Math.max(MIN_EASE, input.ease - EASE_STEP_DOWN),
      intervalDays: 0,
      repetitions: 0,
      lapses: input.lapses + 1,
    };
  }

  const repetitions = input.repetitions + 1;
  const ease = Math.min(MAX_EASE, input.ease + EASE_STEP_UP);
  if (repetitions >= RETIRE_AFTER_REPETITIONS) {
    return {
      retired: true,
      ease,
      repetitions,
      intervalDays: input.intervalDays,
      lapses: input.lapses,
    };
  }

  const intervalDays =
    repetitions === 1 ? 1 : repetitions === 2 ? 3 : Math.round(input.intervalDays * ease) || 6;
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

/**
 * gradeReview's full decision (grade + due-date), extracted so the branch
 * between "retire" and "reschedule" is testable without a database. `today`
 * and `addDays` are injected rather than read from Date.now() directly.
 */
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
