import { describe, expect, it } from "vitest";
import { computeReviewGrade, computeReviewOutcome, deriveAnswerCorrectness } from "./srs";
import type { Question } from "../data/curriculum";

describe("computeReviewGrade", () => {
  it("halves (rather than zeros) repetitions on a wrong answer, and records a lapse", () => {
    const result = computeReviewGrade({
      correct: false,
      ease: 2.3,
      intervalDays: 6,
      repetitions: 2,
      lapses: 1,
      elapsedDays: 6,
    });
    expect(result.retired).toBe(false);
    expect(result.ease).toBeCloseTo(2.1);
    expect(result.repetitions).toBe(1); // floor(2 * 0.5)
    expect(result.intervalDays).toBe(3); // half of the previous 6-day interval
    expect(result.lapses).toBe(2);
  });

  it("drops all the way to a fresh restart when repetitions halves to zero", () => {
    const result = computeReviewGrade({
      correct: false,
      ease: 2.3,
      intervalDays: 1,
      repetitions: 1,
      lapses: 0,
      elapsedDays: 1,
    });
    expect(result.repetitions).toBe(0); // floor(1 * 0.5)
    expect(result.intervalDays).toBe(1); // half of 1 day, floored at the 1-day minimum
  });

  it("scales the post-lapse interval off the item's actual prior interval, not a fixed step keyed off repetitions", () => {
    // Regression test for a real audit finding (2026-09-22): repetitions
    // caps at 3 before RETIRE_AFTER_REPETITIONS kicks in, so
    // floor(repetitions * 0.5) can only ever be 0 or 1 -- a fixed-step
    // lookup on that value collapsed every lapse to the same 1-or-3-day
    // interval regardless of how long the item's real interval had grown.
    // A well-established 40-day item lapsing should land much further out
    // than a brand-new item lapsing, even though both halve to the same
    // repetitions bucket (1).
    const established = computeReviewGrade({
      correct: false,
      ease: 2.6,
      intervalDays: 40,
      repetitions: 3,
      lapses: 0,
      elapsedDays: 40,
    });
    const fresh = computeReviewGrade({
      correct: false,
      ease: 2.6,
      intervalDays: 3,
      repetitions: 2,
      lapses: 0,
      elapsedDays: 3,
    });
    expect(established.repetitions).toBe(1); // floor(3 * 0.5)
    expect(fresh.repetitions).toBe(1); // floor(2 * 0.5) -- same bucket as `established`
    expect(established.intervalDays).toBe(20); // half of 40, not the old fixed 3-day step
    expect(fresh.intervalDays).toBe(2); // half of 3
    expect(established.intervalDays).toBeGreaterThan(fresh.intervalDays);
  });

  it("floors ease at 1.3 so it never goes negative on repeated misses", () => {
    const result = computeReviewGrade({
      correct: false,
      ease: 1.35,
      intervalDays: 0,
      repetitions: 0,
      lapses: 0,
      elapsedDays: 0,
    });
    expect(result.ease).toBe(1.3);
  });

  it("sets a 1-day interval on the first correct repetition", () => {
    const result = computeReviewGrade({
      correct: true,
      ease: 2.3,
      intervalDays: 0,
      repetitions: 0,
      lapses: 0,
      elapsedDays: 0,
    });
    expect(result.retired).toBe(false);
    expect(result.ease).toBeCloseTo(2.45);
    expect(result.intervalDays).toBe(1);
    expect(result.repetitions).toBe(1);
    expect(result.lapses).toBe(0);
  });

  it("sets a 3-day interval on the second correct repetition", () => {
    const result = computeReviewGrade({
      correct: true,
      ease: 2.45,
      intervalDays: 1,
      repetitions: 1,
      lapses: 0,
      elapsedDays: 1,
    });
    expect(result.intervalDays).toBe(3);
    expect(result.repetitions).toBe(2);
  });

  it("grows the interval by ease on the third correct repetition when reviewed on schedule", () => {
    const result = computeReviewGrade({
      correct: true,
      ease: 2.6,
      intervalDays: 3,
      repetitions: 2,
      lapses: 0,
      elapsedDays: 3, // exactly on schedule -> overdue bonus is a no-op (1x)
    });
    // repetitions becomes 3, ease becomes min(2.8, 2.6+0.15) = 2.75
    expect(result.repetitions).toBe(3);
    expect(result.intervalDays).toBe(Math.round(3 * 2.75));
  });

  it("grows the interval further when the review happens well past its due date", () => {
    const onTime = computeReviewGrade({
      correct: true,
      ease: 2.6,
      intervalDays: 3,
      repetitions: 2,
      lapses: 0,
      elapsedDays: 3,
    });
    const wayOverdue = computeReviewGrade({
      correct: true,
      ease: 2.6,
      intervalDays: 3,
      repetitions: 2,
      lapses: 0,
      elapsedDays: 30, // 10x overdue
    });
    // Capped at the 1.5x max bonus, not the full 10x overdue ratio.
    expect(wayOverdue.intervalDays).toBe(Math.round(3 * 2.75 * 1.5));
    expect(wayOverdue.intervalDays).toBeGreaterThan(onTime.intervalDays);
  });

  it("retires the item after 4 clean repetitions in a row", () => {
    const result = computeReviewGrade({
      correct: true,
      ease: 2.75,
      intervalDays: 8,
      repetitions: 3,
      lapses: 0,
      elapsedDays: 8,
    });
    expect(result.retired).toBe(true);
    expect(result.repetitions).toBe(4);
  });

  it("caps ease at 2.8 so it never grows unbounded", () => {
    const result = computeReviewGrade({
      correct: true,
      ease: 2.75,
      intervalDays: 10,
      repetitions: 1,
      lapses: 0,
      elapsedDays: 10,
    });
    expect(result.ease).toBe(2.8);
  });

  it("falls back to a 6-day interval if the growth formula rounds to zero", () => {
    const result = computeReviewGrade({
      correct: true,
      ease: 1.3,
      intervalDays: 0,
      repetitions: 2,
      lapses: 0,
      elapsedDays: 0,
    });
    // repetitions becomes 3, interval_days input is 0 -> overdue bonus is a
    // no-op (can't divide by a zero interval) -> round(0 * ease) || 6
    expect(result.intervalDays).toBe(6);
  });
});

describe("computeReviewOutcome", () => {
  const today = "2026-09-14";
  const addDays = (days: number) => `2026-09-${String(14 + days).padStart(2, "0")}`;

  it("schedules a correct-but-not-yet-retired answer using the grown interval", () => {
    const outcome = computeReviewOutcome(
      { correct: true, ease: 2.3, intervalDays: 0, repetitions: 0, lapses: 0, elapsedDays: 0 },
      today,
      addDays,
    );
    expect(outcome).toEqual({
      retired: false,
      dueOn: "2026-09-15",
      ease: expect.closeTo(2.45),
      intervalDays: 1,
      repetitions: 1,
      lapses: 0,
    });
  });

  it("reschedules a wrong answer for today, not a future date", () => {
    const outcome = computeReviewOutcome(
      { correct: false, ease: 2.3, intervalDays: 6, repetitions: 2, lapses: 1, elapsedDays: 6 },
      today,
      addDays,
    );
    expect(outcome.retired).toBe(false);
    if (!outcome.retired) {
      expect(outcome.dueOn).toBe(today);
      expect(outcome.repetitions).toBe(1); // halved from 2, not reset to 0
    }
  });

  it("retires the item and sets dueOn to today, ignoring addDays", () => {
    const outcome = computeReviewOutcome(
      { correct: true, ease: 2.75, intervalDays: 8, repetitions: 3, lapses: 0, elapsedDays: 8 },
      today,
      () => {
        throw new Error("addDays should not be called for a retired item");
      },
    );
    expect(outcome).toEqual({ retired: true, dueOn: today });
  });
});

describe("deriveAnswerCorrectness", () => {
  const mc: Question = {
    id: "q1",
    type: "mc",
    prompt: "Pick the right one",
    choices: ["cat", "dog", "bird"],
    answer: 1,
    explanation: "",
  };
  const fill: Question = {
    id: "q2",
    type: "fill",
    prompt: "The ___ barks",
    bank: ["dog", "cat"],
    answer: "dog",
    explanation: "",
  };

  it("checks an mc answer by choice text, not index", () => {
    expect(deriveAnswerCorrectness(mc, "dog")).toBe(true);
    expect(deriveAnswerCorrectness(mc, "cat")).toBe(false);
  });

  it("rejects an mc answer that isn't even one of the real choices", () => {
    expect(deriveAnswerCorrectness(mc, "elephant")).toBe(false);
  });

  it("checks a fill answer case-insensitively and trims whitespace", () => {
    expect(deriveAnswerCorrectness(fill, "Dog")).toBe(true);
    expect(deriveAnswerCorrectness(fill, "  dog  ")).toBe(true);
    expect(deriveAnswerCorrectness(fill, "cat")).toBe(false);
  });

  it("rejects an empty answer", () => {
    expect(deriveAnswerCorrectness(mc, "")).toBe(false);
    expect(deriveAnswerCorrectness(fill, "")).toBe(false);
  });
});
