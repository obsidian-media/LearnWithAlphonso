// Mirrors src/lib/spoken-answer.test.ts's vectors exactly. This file is the
// parity guard: the player grades a spoken answer with the TypeScript original
// and tells the learner the verdict, then this function's copy re-derives it
// server-side. If the two ever disagree the learner is shown "Still got it"
// and has the item lapsed anyway, which is invisible from either side alone.
import { assertEquals } from "jsr:@std/assert@1";
import { matchesSpokenAnswer, normaliseSpoken } from "./spoken-answer.ts";

Deno.test("normaliseSpoken strips punctuation and case", () => {
  assertEquals(normaliseSpoken("She's a Doctor!"), normaliseSpoken("shes a doctor"));
});

Deno.test("normaliseSpoken treats a contraction and its expansion as the same", () => {
  assertEquals(normaliseSpoken("she is a doctor"), normaliseSpoken("she's a doctor"));
  assertEquals(normaliseSpoken("I do not understand"), normaliseSpoken("I don't understand"));
  assertEquals(normaliseSpoken("we will see"), normaliseSpoken("we'll see"));
});

Deno.test("normaliseSpoken collapses whitespace", () => {
  assertEquals(normaliseSpoken("  good   morning "), normaliseSpoken("good morning"));
});

Deno.test("matchesSpokenAnswer accepts the expected phrase however it was transcribed", () => {
  assertEquals(matchesSpokenAnswer("She's a doctor.", "She is a doctor"), true);
  assertEquals(matchesSpokenAnswer("she is a DOCTOR", "She's a doctor"), true);
  assertEquals(matchesSpokenAnswer("I don't understand", "I do not understand."), true);
});

Deno.test("matchesSpokenAnswer forgives a leading filler word", () => {
  assertEquals(matchesSpokenAnswer("um, she's a doctor", "She's a doctor"), true);
  assertEquals(matchesSpokenAnswer("uh good morning", "Good morning."), true);
});

Deno.test("matchesSpokenAnswer rejects a different sentence", () => {
  assertEquals(matchesSpokenAnswer("he is a driver", "She's a doctor"), false);
});

Deno.test("matchesSpokenAnswer rejects a partial attempt", () => {
  assertEquals(matchesSpokenAnswer("she is", "She's a doctor"), false);
  assertEquals(matchesSpokenAnswer("good", "Good morning."), false);
});

Deno.test("matchesSpokenAnswer treats an empty transcript as no answer", () => {
  assertEquals(matchesSpokenAnswer("", "She's a doctor"), false);
  assertEquals(matchesSpokenAnswer("   ", "She's a doctor"), false);
});

Deno.test("matchesSpokenAnswer matches a number word against the numeral Deepgram returns", () => {
  assertEquals(matchesSpokenAnswer("the bus leaves at 9", "The bus leaves at nine."), true);
  assertEquals(matchesSpokenAnswer("I have 2 brothers", "I have two brothers."), true);
  assertEquals(matchesSpokenAnswer("I have 3 brothers", "I have two brothers."), false);
});
