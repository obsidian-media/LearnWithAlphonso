import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { weekStartFor, rankCohort, computePromotions } from "./season-math.ts";

Deno.test("weekStartFor returns the Monday of the given date's ISO week", () => {
  // 2026-09-24 is a Thursday
  assertEquals(weekStartFor(new Date("2026-09-24T12:00:00Z")), "2026-09-21");
  // 2026-09-21 is already a Monday
  assertEquals(weekStartFor(new Date("2026-09-21T00:00:00Z")), "2026-09-21");
  // 2026-09-27 is a Sunday -- still the same week as the 21st
  assertEquals(weekStartFor(new Date("2026-09-27T23:59:59Z")), "2026-09-21");
});

Deno.test("rankCohort sorts by xp descending, 1-indexed", () => {
  const ranked = rankCohort([
    { userId: "a", xp: 100 },
    { userId: "b", xp: 300 },
    { userId: "c", xp: 200 },
  ]);
  assertEquals(ranked, [
    { userId: "b", rank: 1 },
    { userId: "c", rank: 2 },
    { userId: "a", rank: 3 },
  ]);
});

Deno.test("rankCohort breaks ties by userId for determinism", () => {
  const ranked = rankCohort([
    { userId: "z", xp: 100 },
    { userId: "a", xp: 100 },
  ]);
  assertEquals(ranked, [
    { userId: "a", rank: 1 },
    { userId: "z", rank: 2 },
  ]);
});

Deno.test("computePromotions: cohort of 30 promotes top 10, demotes bottom 5", () => {
  const ranked = Array.from({ length: 30 }, (_, i) => ({ userId: `u${i + 1}`, rank: i + 1 }));
  const result = computePromotions(ranked, 3);
  const promoted = result.filter((r) => r.newDivision === 4).map((r) => r.userId);
  const demoted = result.filter((r) => r.newDivision === 2).map((r) => r.userId);
  const stayed = result.filter((r) => r.newDivision === 3).map((r) => r.userId);
  assertEquals(promoted.length, 10);
  assertEquals(demoted.length, 5);
  assertEquals(stayed.length, 15);
  assertEquals(promoted, ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8", "u9", "u10"]);
  assertEquals(demoted, ["u26", "u27", "u28", "u29", "u30"]);
});

Deno.test("computePromotions: tiny cohort (size 2) promotes and demotes nobody (floor rounding)", () => {
  const ranked = [{ userId: "a", rank: 1 }, { userId: "b", rank: 2 }];
  const result = computePromotions(ranked, 2);
  assertEquals(result.every((r) => r.newDivision === 2), true);
});

Deno.test("computePromotions: Division 5 has no promotion target, top performers stay", () => {
  const ranked = Array.from({ length: 30 }, (_, i) => ({ userId: `u${i + 1}`, rank: i + 1 }));
  const result = computePromotions(ranked, 5);
  assertEquals(result.filter((r) => r.newDivision === 5).length, 25); // top 10 would've promoted, capped at 5
  assertEquals(result.filter((r) => r.newDivision === 4).length, 5); // bottom 5 still demote normally
});

Deno.test("computePromotions: Division 1 has no demotion target, bottom performers stay", () => {
  const ranked = Array.from({ length: 30 }, (_, i) => ({ userId: `u${i + 1}`, rank: i + 1 }));
  const result = computePromotions(ranked, 1);
  assertEquals(result.filter((r) => r.newDivision === 2).length, 10); // top 10 still promote normally
  assertEquals(result.filter((r) => r.newDivision === 1).length, 20); // bottom 5 would've demoted, floored at 1
});
