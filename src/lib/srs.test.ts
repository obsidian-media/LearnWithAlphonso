import { describe, expect, it } from "vitest";
import { computeReviewGrade } from "./srs";

describe("computeReviewGrade", () => {
  it("resets interval and repetitions on a wrong answer, and records a lapse", () => {
    const result = computeReviewGrade({
      correct: false,
      ease: 2.3,
      intervalDays: 6,
      repetitions: 2,
      lapses: 1,
    });
    expect(result.retired).toBe(false);
    expect(result.ease).toBeCloseTo(2.1);
    expect(result.intervalDays).toBe(0);
    expect(result.repetitions).toBe(0);
    expect(result.lapses).toBe(2);
  });

  it("floors ease at 1.3 so it never goes negative on repeated misses", () => {
    const result = computeReviewGrade({
      correct: false,
      ease: 1.35,
      intervalDays: 0,
      repetitions: 0,
      lapses: 0,
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
    });
    expect(result.intervalDays).toBe(3);
    expect(result.repetitions).toBe(2);
  });

  it("grows the interval by ease on the third correct repetition", () => {
    const result = computeReviewGrade({
      correct: true,
      ease: 2.6,
      intervalDays: 3,
      repetitions: 2,
      lapses: 0,
    });
    // repetitions becomes 3, ease becomes min(2.8, 2.6+0.15) = 2.75
    expect(result.repetitions).toBe(3);
    expect(result.intervalDays).toBe(Math.round(3 * 2.75));
  });

  it("retires the item after 4 clean repetitions in a row", () => {
    const result = computeReviewGrade({
      correct: true,
      ease: 2.75,
      intervalDays: 8,
      repetitions: 3,
      lapses: 0,
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
    });
    // repetitions becomes 3, interval_days input is 0 -> round(0 * ease) || 6
    expect(result.intervalDays).toBe(6);
  });
});
