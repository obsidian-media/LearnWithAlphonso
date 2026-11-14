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
  HEART_REFILL_MS,
  MAX_HEARTS,
  gainHearts,
  heartsGate,
  heartsGateEnforced,
  loseHeart,
  serverHeartsMode,
  outOfHeartsBody,
  perfectLessonBonusEarned,
  resolveHeartsRefill,
  streakHeartMilestoneReached,
} from "./hearts.ts";

const T0 = 1_700_000_000_000;
const STEP = HEART_REFILL_MS;

Deno.test("resolveHeartsRefill: full hearts have no timer", () => {
  assertEquals(resolveHeartsRefill(MAX_HEARTS, T0 + 5, T0), { hearts: MAX_HEARTS, heartsRefillAt: null });
});

Deno.test("resolveHeartsRefill leaves hearts untouched before the refill timestamp", () => {
  assertEquals(resolveHeartsRefill(2, T0 + 1000, T0), { hearts: 2, heartsRefillAt: T0 + 1000 });
});

Deno.test("resolveHeartsRefill gives exactly one heart per due interval", () => {
  assertEquals(resolveHeartsRefill(2, T0 - 1, T0), { hearts: 3, heartsRefillAt: T0 - 1 + STEP });
  assertEquals(resolveHeartsRefill(0, T0, T0), { hearts: 1, heartsRefillAt: T0 + STEP });
});

Deno.test("resolveHeartsRefill: two hours away gives four hearts", () => {
  const due = T0 - 4 * STEP + 1000;
  assertEquals(resolveHeartsRefill(0, due, T0), { hearts: 4, heartsRefillAt: due + 4 * STEP });
});

Deno.test("resolveHeartsRefill carries the leftover time into the next heart", () => {
  assertEquals(resolveHeartsRefill(1, T0 - 1.5 * STEP, T0), { hearts: 3, heartsRefillAt: T0 + 0.5 * STEP });
});

Deno.test("resolveHeartsRefill caps at MAX_HEARTS and clears the timer", () => {
  assertEquals(resolveHeartsRefill(3, T0 - 10 * STEP, T0), { hearts: MAX_HEARTS, heartsRefillAt: null });
});

Deno.test("resolveHeartsRefill starts the clock for a row below the cap that has none", () => {
  assertEquals(resolveHeartsRefill(3, null, T0), { hearts: 3, heartsRefillAt: T0 + STEP });
});

Deno.test("loseHeart starts a clock from full, keeps a running clock, never goes below zero", () => {
  assertEquals(loseHeart(MAX_HEARTS, null, T0), { hearts: 4, heartsRefillAt: T0 + STEP });
  assertEquals(loseHeart(3, T0 + 600_000, T0), { hearts: 2, heartsRefillAt: T0 + 600_000 });
  assertEquals(loseHeart(2, T0 - 1, T0), { hearts: 2, heartsRefillAt: T0 - 1 + STEP });
  assertEquals(loseHeart(0, T0 + 5, T0), { hearts: 0, heartsRefillAt: T0 + 5 });
});

Deno.test("gainHearts keeps a running clock below the cap and clears it at the cap", () => {
  assertEquals(gainHearts(2, 1, T0 + 900, T0), { hearts: 3, heartsRefillAt: T0 + 900 });
  assertEquals(gainHearts(4, 3, T0 + 900, T0), { hearts: MAX_HEARTS, heartsRefillAt: null });
  assertEquals(gainHearts(0, 1, null, T0), { hearts: 1, heartsRefillAt: T0 + STEP });
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

// The server-side lesson gate. Vectors mirror src/lib/hearts.test.ts's heartsGate block exactly.
Deno.test("heartsGate is open with hearts left", () => {
  assertEquals(heartsGate(1, null, 1_000), { blocked: false });
});

Deno.test("heartsGate blocks at 0 hearts before the refill time and reports it", () => {
  assertEquals(heartsGate(0, 5_000, 1_000), { blocked: true, refillAt: 5_000 });
});

Deno.test("heartsGate opens once the refill time has passed (resolveHeartsRefill first)", () => {
  assertEquals(heartsGate(0, 5_000, 5_000), { blocked: false });
});

Deno.test("heartsGate blocks a negative count with no timer and starts the clock", () => {
  assertEquals(heartsGate(-1, null, 1_000), { blocked: true, refillAt: 1_000 + HEART_REFILL_MS });
});

Deno.test("heartsGate stays blocked a moment before the first heart is due", () => {
  assertEquals(heartsGate(0, 5_000, 4_999), { blocked: true, refillAt: 5_000 });
});

Deno.test("outOfHeartsBody is the contract shape with an ISO refillAt", () => {
  assertEquals(outOfHeartsBody(Date.UTC(2026, 9, 8, 12, 30)), {
    error: "out-of-hearts",
    refillAt: "2026-10-08T12:30:00.000Z",
  });
  assertEquals(outOfHeartsBody(null), { error: "out-of-hearts", refillAt: null });
});

Deno.test("heartsGateEnforced defaults on and only the literal 'false' turns it off", () => {
  assertEquals(heartsGateEnforced(() => undefined), true);
  assertEquals(heartsGateEnforced(() => "true"), true);
  assertEquals(heartsGateEnforced(() => "0"), true);
  assertEquals(heartsGateEnforced(() => "false"), false);
});

Deno.test("serverHeartsMode is enforced by default; only 'shadow' records alone and 'off' skips (same as the web copy)", () => {
  const mode = (v: string | undefined) => serverHeartsMode(() => v);
  assertEquals(mode(undefined), "on");
  assertEquals(mode(""), "on");
  assertEquals(mode("yes"), "on");
  assertEquals(mode(" ON "), "on");
  assertEquals(mode(" Shadow "), "shadow");
  assertEquals(mode("off"), "off");
  assertEquals(mode("OFF"), "off");
});
