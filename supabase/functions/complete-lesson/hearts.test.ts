// Mirrors the subset of src/lib/hearts.test.ts covering the functions this
// Deno port actually re-implements (verified against index.ts's imports --
// buyHeartWithXp is deliberately absent here: heart purchases run through
// the buy_heart_with_xp Postgres RPC, not complete-lesson, see
// ARCHITECTURE.md's "Hearts economy" section). This is the parity guard for
// this file's own header comment ("Keep this byte-for-byte equivalent to
// the source of truth"): if this Deno copy ever drifts from the TypeScript
// source of truth, this test should be the one that catches it, alongside
// the existing TS/Swift copies. Run with `deno test supabase/functions/complete-lesson/`.
import { assertEquals } from "jsr:@std/assert@1";
import {
  MAX_HEARTS,
  gainHearts,
  perfectLessonBonusEarned,
  resolveHeartsRefill,
  streakHeartMilestoneReached,
} from "./hearts.ts";

Deno.test("resolveHeartsRefill leaves hearts untouched when no refill is pending", () => {
  assertEquals(resolveHeartsRefill(3, null, Date.now()), { hearts: 3, heartsRefillAt: null });
});

Deno.test("resolveHeartsRefill leaves hearts untouched before the refill timestamp", () => {
  const now = Date.now();
  assertEquals(resolveHeartsRefill(0, now + 1000, now), { hearts: 0, heartsRefillAt: now + 1000 });
});

Deno.test("resolveHeartsRefill restores to MAX_HEARTS and clears the timer once the timestamp has passed", () => {
  const now = Date.now();
  assertEquals(resolveHeartsRefill(0, now - 1, now), { hearts: MAX_HEARTS, heartsRefillAt: null });
});

Deno.test("resolveHeartsRefill restores exactly at the refill timestamp (boundary)", () => {
  const now = Date.now();
  assertEquals(resolveHeartsRefill(0, now, now), { hearts: MAX_HEARTS, heartsRefillAt: null });
});

Deno.test("gainHearts adds hearts up to the cap", () => {
  assertEquals(gainHearts(3, 1), { hearts: 4, heartsRefillAt: null });
});

Deno.test("gainHearts caps at MAX_HEARTS", () => {
  assertEquals(gainHearts(4, 3), { hearts: MAX_HEARTS, heartsRefillAt: null });
});

Deno.test("gainHearts clears a pending refill timer on any gain", () => {
  assertEquals(gainHearts(0, 1), { hearts: 1, heartsRefillAt: null });
});

Deno.test("perfectLessonBonusEarned is true when every question was correct", () => {
  assertEquals(perfectLessonBonusEarned(8, 8), true);
});

Deno.test("perfectLessonBonusEarned is false on any miss", () => {
  assertEquals(perfectLessonBonusEarned(7, 8), false);
});

Deno.test("perfectLessonBonusEarned is false for a zero-question lesson", () => {
  assertEquals(perfectLessonBonusEarned(0, 0), false);
});

Deno.test("streakHeartMilestoneReached fires when the streak advances onto a multiple of 7", () => {
  assertEquals(streakHeartMilestoneReached(6, 7), true);
});

Deno.test("streakHeartMilestoneReached does not fire again on a same-day re-check (streak unchanged)", () => {
  assertEquals(streakHeartMilestoneReached(7, 7), false);
});

Deno.test("streakHeartMilestoneReached does not fire on non-multiples", () => {
  assertEquals(streakHeartMilestoneReached(7, 8), false);
});

Deno.test("streakHeartMilestoneReached fires at 14, 21, etc.", () => {
  assertEquals(streakHeartMilestoneReached(13, 14), true);
  assertEquals(streakHeartMilestoneReached(20, 21), true);
});
