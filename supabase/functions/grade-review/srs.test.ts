// Mirrors src/lib/srs.test.ts and
// ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/SRSEngineTests.swift
// exactly (same vectors) -- this is the parity guard for the three hand-synced
// ports described in this file's own header comment and ARCHITECTURE.md's
// "Known rough edges": if this Deno copy of srs.ts ever drifts from the
// TypeScript source of truth, this test (not just the TS/Swift ones) should
// be the one that catches it. Run with `deno test supabase/functions/grade-review/`.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { computeReviewGrade, computeReviewOutcome } from "./srs.ts";

Deno.test("computeReviewGrade resets interval and repetitions on a wrong answer, and records a lapse", () => {
  const result = computeReviewGrade({ correct: false, ease: 2.3, intervalDays: 6, repetitions: 2, lapses: 1 });
  assertEquals(result.retired, false);
  assert(Math.abs(result.ease - 2.1) < 0.0001);
  assertEquals(result.intervalDays, 0);
  assertEquals(result.repetitions, 0);
  assertEquals(result.lapses, 2);
});

Deno.test("computeReviewGrade floors ease at 1.3 so it never goes negative on repeated misses", () => {
  const result = computeReviewGrade({ correct: false, ease: 1.35, intervalDays: 0, repetitions: 0, lapses: 0 });
  assertEquals(result.ease, 1.3);
});

Deno.test("computeReviewGrade sets a 1-day interval on the first correct repetition", () => {
  const result = computeReviewGrade({ correct: true, ease: 2.3, intervalDays: 0, repetitions: 0, lapses: 0 });
  assertEquals(result.retired, false);
  assert(Math.abs(result.ease - 2.45) < 0.0001);
  assertEquals(result.intervalDays, 1);
  assertEquals(result.repetitions, 1);
  assertEquals(result.lapses, 0);
});

Deno.test("computeReviewGrade sets a 3-day interval on the second correct repetition", () => {
  const result = computeReviewGrade({ correct: true, ease: 2.45, intervalDays: 1, repetitions: 1, lapses: 0 });
  assertEquals(result.intervalDays, 3);
  assertEquals(result.repetitions, 2);
});

Deno.test("computeReviewGrade grows the interval by ease on the third correct repetition", () => {
  const result = computeReviewGrade({ correct: true, ease: 2.6, intervalDays: 3, repetitions: 2, lapses: 0 });
  assertEquals(result.repetitions, 3);
  assertEquals(result.intervalDays, Math.round(3 * 2.75));
});

Deno.test("computeReviewGrade retires the item after 4 clean repetitions in a row", () => {
  const result = computeReviewGrade({ correct: true, ease: 2.75, intervalDays: 8, repetitions: 3, lapses: 0 });
  assertEquals(result.retired, true);
  assertEquals(result.repetitions, 4);
});

Deno.test("computeReviewGrade caps ease at 2.8 so it never grows unbounded", () => {
  const result = computeReviewGrade({ correct: true, ease: 2.75, intervalDays: 10, repetitions: 1, lapses: 0 });
  assertEquals(result.ease, 2.8);
});

Deno.test("computeReviewGrade falls back to a 6-day interval if the growth formula rounds to zero", () => {
  const result = computeReviewGrade({ correct: true, ease: 1.3, intervalDays: 0, repetitions: 2, lapses: 0 });
  assertEquals(result.intervalDays, 6);
});

const today = "2026-09-14";
const addDays = (days: number) => `2026-09-${String(14 + days).padStart(2, "0")}`;

Deno.test("computeReviewOutcome schedules a correct-but-not-yet-retired answer using the grown interval", () => {
  const outcome = computeReviewOutcome(
    { correct: true, ease: 2.3, intervalDays: 0, repetitions: 0, lapses: 0 },
    today,
    addDays,
  );
  assert(!outcome.retired);
  assertEquals(outcome.dueOn, "2026-09-15");
  assert(Math.abs(outcome.ease - 2.45) < 0.0001);
  assertEquals(outcome.intervalDays, 1);
  assertEquals(outcome.repetitions, 1);
  assertEquals(outcome.lapses, 0);
});

Deno.test("computeReviewOutcome reschedules a wrong answer for today, not a future date", () => {
  const outcome = computeReviewOutcome(
    { correct: false, ease: 2.3, intervalDays: 6, repetitions: 2, lapses: 1 },
    today,
    addDays,
  );
  assertEquals(outcome.retired, false);
  assert(!outcome.retired);
  assertEquals(outcome.dueOn, today);
  assertEquals(outcome.repetitions, 0);
});

Deno.test("computeReviewOutcome retires the item and sets dueOn to today, ignoring addDays", () => {
  const outcome = computeReviewOutcome(
    { correct: true, ease: 2.75, intervalDays: 8, repetitions: 3, lapses: 0 },
    today,
    () => {
      throw new Error("addDays should not be called for a retired item");
    },
  );
  assertEquals(outcome, { retired: true, dueOn: today });
});
