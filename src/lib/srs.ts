/** Pure SM-2-style grading extracted from review.functions.ts, so it can be
 * unit tested without a database. The handler still owns reading/writing
 * rows and computing the actual due date from `intervalDays`. */

import type { Question } from "../data/curriculum";

/**
 * gradeReview used to trust a raw `correct: boolean` from the client --
 * trivially fakeable, and combined with the review-clear heart bonus let
 * a user fabricate an item via recordMisses and instantly grade it
 * "correct" for free. This re-derives correctness server-side against the
 * real question, the same derive-don't-trust pattern
 * deriveLessonCompletion already uses for lesson completions. Mirrors the
 * comparison logic already duplicated client-side in review.tsx and
 * lesson.$id.tsx.
 */
export function deriveAnswerCorrectness(question: Question, answer: string): boolean {
  return question.type === "mc"
    ? question.choices[question.answer] === answer
    : answer.trim().toLowerCase() === question.answer.trim().toLowerCase();
}

export type ReviewGradeInput = {
  correct: boolean;
  ease: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  /**
   * Real calendar days elapsed since this item was last reviewed (or since
   * it was created, for a never-yet-reviewed item). Ignored when
   * repetitions is 0 or 1 (those use fixed 1-day/3-day steps regardless of
   * how overdue the review was) -- only feeds the overdue-growth-bonus
   * below. Callers compute this from last_reviewed_at/created_at vs. the
   * actual review date, not from due_on -- a review can legitimately
   * happen later than scheduled (gradeReview only rejects *early* grading,
   * see review.functions.ts), and this is specifically about rewarding
   * that "recalled it despite being overdue" case accurately.
   */
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
/**
 * Reviewing an item successfully well past its due date is real evidence
 * of a more durable memory than reviewing it right on schedule -- the
 * "spacing effect," well-established in memory research independent of
 * any specific SRS algorithm's tuning. Capped at 1.5x so one very-overdue
 * review can't cause a wild interval swing.
 */
const MAX_OVERDUE_GROWTH_BONUS = 1.5;
/**
 * A lapse used to reset repetitions to 0 outright, forcing the item back
 * through the full 1-day -> 3-day -> grown-interval ladder from scratch
 * even if it had built up a long interval first. That's the single most
 * criticized property of vanilla SM-2 -- one slip erases arbitrarily much
 * earned progress. Halving instead keeps a lapse meaningful (still a real
 * setback) without being maximally punishing.
 */
const LAPSE_REPETITIONS_RETENTION = 0.5;
/**
 * SM-2 audit finding (2026-09-22): the interval side of a lapse used to
 * snap to a fixed step (1 or 3 days) keyed off the *halved repetitions*
 * bucket, not the item's actual prior interval -- and because
 * RETIRE_AFTER_REPETITIONS caps live repetitions at 3,
 * floor(repetitions * LAPSE_REPETITIONS_RETENTION) can only ever land on 0
 * or 1, so every lapse collapsed to the same two possible intervals (1 or 3
 * days) regardless of whether the item had earned a 6-day or a 60-day
 * interval. That defeated the "halving, not zeroing" intent above -- a
 * well-established item lost just as much ground as a brand-new one.
 * Scaling directly off the previous intervalDays instead makes the
 * retention proportional to what was actually earned, floored at 1 day.
 */
const LAPSE_INTERVAL_RETENTION = 0.5;

/**
 * Wrong answer: halve (rather than zero out) repetitions and record a
 * lapse -- softer than a full reset, still a real setback. Correct
 * answer: grow the interval (1 day, then 3, then interval * ease *
 * overdue-bonus), and retire the item once it's been answered correctly 4
 * times running.
 */
export function computeReviewGrade(input: ReviewGradeInput): ReviewGradeResult {
  const ease = input.correct
    ? Math.min(MAX_EASE, input.ease + EASE_STEP_UP)
    : Math.max(MIN_EASE, input.ease - EASE_STEP_DOWN);

  if (!input.correct) {
    const repetitions = Math.floor(input.repetitions * LAPSE_REPETITIONS_RETENTION);
    const intervalDays = Math.max(1, Math.round(input.intervalDays * LAPSE_INTERVAL_RETENTION));
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

  if (repetitions === 1)
    return { retired: false, ease, repetitions, intervalDays: 1, lapses: input.lapses };
  if (repetitions === 2)
    return { retired: false, ease, repetitions, intervalDays: 3, lapses: input.lapses };

  const overdueBonus =
    input.intervalDays > 0
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
