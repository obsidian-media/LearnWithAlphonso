// Mirrors src/lib/translation-answer.test.ts's vectors exactly. This file is
// the parity guard: the players and /api/grade-translation grade a written
// translation with the TypeScript original, and this copy re-derives the same
// verdict for review items. If the two ever disagree the learner is shown
// "Still got it" and has the item lapsed anyway, which is invisible from either
// side alone.
import { assertEquals } from "jsr:@std/assert@1";
import { matchesAcceptableAnswer, normaliseWritten } from "./translation-answer.ts";

const ACCEPTED = ["I don't understand.", "I do not understand.", "Sorry, I don't understand."];

Deno.test("matchesAcceptableAnswer accepts any curated phrasing", () => {
  assertEquals(matchesAcceptableAnswer("i dont understand", ACCEPTED), true);
  assertEquals(matchesAcceptableAnswer("I DO NOT UNDERSTAND!", ACCEPTED), true);
  assertEquals(matchesAcceptableAnswer("sorry, I don't understand", ACCEPTED), true);
});

Deno.test("normaliseWritten answers the contraction question like spoken answers do", () => {
  assertEquals(normaliseWritten("I don't understand"), normaliseWritten("I do not understand"));
  assertEquals(
    normaliseWritten("we are meeting at the café"),
    normaliseWritten("We are meeting at the cafe"),
  );
});

Deno.test("matchesAcceptableAnswer rejects a different or partial sentence", () => {
  assertEquals(matchesAcceptableAnswer("I understand", ACCEPTED), false);
  assertEquals(matchesAcceptableAnswer("I do not", ACCEPTED), false);
});

Deno.test("matchesAcceptableAnswer treats an empty submission as no answer", () => {
  assertEquals(matchesAcceptableAnswer("", ACCEPTED), false);
  assertEquals(matchesAcceptableAnswer("   ", ACCEPTED), false);
});

Deno.test("matchesAcceptableAnswer fails closed on an empty acceptable list", () => {
  assertEquals(matchesAcceptableAnswer("anything at all", []), false);
});
