// Mirrors src/lib/spoken-answer-es.test.ts's vectors exactly. This file is
// the parity guard: the player grades a spoken answer with the TypeScript
// original and tells the learner the verdict, then this function's copy
// re-derives it server-side. If the two ever disagree the learner is shown
// "Still got it" and has the item lapsed anyway, which is invisible from
// either side alone.
import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { matchesSpokenAnswerEs, normaliseSpokenEs } from "./spoken-answer-es.ts";

Deno.test("normaliseSpokenEs strips punctuation and case", () => {
  assertEquals(normaliseSpokenEs("¡Hola! ¿Cómo estás?"), normaliseSpokenEs("hola como estas"));
});

Deno.test("normaliseSpokenEs folds accents rather than deleting them", () => {
  assertEquals(normaliseSpokenEs("está"), normaliseSpokenEs("esta"));
  assertEquals(normaliseSpokenEs("años"), normaliseSpokenEs("anos"));
  assertNotEquals(normaliseSpokenEs("sí"), normaliseSpokenEs("no"));
  assertEquals(normaliseSpokenEs("sí"), normaliseSpokenEs("si"));
});

Deno.test("normaliseSpokenEs collapses whitespace", () => {
  assertEquals(normaliseSpokenEs("  hola   señora "), normaliseSpokenEs("hola senora"));
});

Deno.test("normaliseSpokenEs drops a silent h", () => {
  assertEquals(normaliseSpokenEs("hola"), normaliseSpokenEs("ola"));
  assertEquals(normaliseSpokenEs("ahora"), normaliseSpokenEs("aora"));
  assertEquals(normaliseSpokenEs("zanahoria"), normaliseSpokenEs("zanaoria"));
  assertEquals(normaliseSpokenEs("tengo dos hermanas"), normaliseSpokenEs("tengo dos ermanas"));
});

Deno.test("normaliseSpokenEs keeps the h in the ch digraph, which is not silent", () => {
  assertNotEquals(normaliseSpokenEs("chico"), normaliseSpokenEs("cico"));
  assertNotEquals(normaliseSpokenEs("coche"), normaliseSpokenEs("coce"));
  assertEquals(normaliseSpokenEs("chico"), normaliseSpokenEs("chico"));
});

Deno.test("matchesSpokenAnswerEs accepts the expected phrase however the silent h was transcribed", () => {
  assertEquals(matchesSpokenAnswerEs("Hola, ¿qué tal?", "hola que tal"), true);
  assertEquals(matchesSpokenAnswerEs("ola que tal", "Hola, ¿qué tal?"), true);
});

Deno.test("matchesSpokenAnswerEs forgives a leading filler word", () => {
  assertEquals(matchesSpokenAnswerEs("eh, hola", "Hola."), true);
});

Deno.test("matchesSpokenAnswerEs rejects a different sentence", () => {
  assertEquals(matchesSpokenAnswerEs("el esta cansado", "Ella está cansada."), false);
});

Deno.test("matchesSpokenAnswerEs rejects a partial attempt", () => {
  assertEquals(matchesSpokenAnswerEs("hola", "Hola, ¿cómo estás?"), false);
});

Deno.test("matchesSpokenAnswerEs treats an empty transcript as no answer", () => {
  assertEquals(matchesSpokenAnswerEs("", "Hola."), false);
  assertEquals(matchesSpokenAnswerEs("   ", "Hola."), false);
});

Deno.test("matchesSpokenAnswerEs matches a number word against the numeral Deepgram returns", () => {
  assertEquals(matchesSpokenAnswerEs("tengo dos hermanos", "Tengo 2 hermanos."), true);
  assertEquals(matchesSpokenAnswerEs("son las cinco", "Son las 5."), true);
  assertEquals(matchesSpokenAnswerEs("tengo veinte anos", "Tengo veinte años."), true);
  assertEquals(matchesSpokenAnswerEs("tengo dieciseis anos", "Tengo dieciséis años."), true);
  assertEquals(matchesSpokenAnswerEs("hay veintidos personas", "Hay veintidós personas."), true);
  assertEquals(matchesSpokenAnswerEs("tengo tres hermanos", "Tengo dos hermanos."), false);
});

Deno.test("matchesSpokenAnswerEs does NOT map un/una to 1", () => {
  assertNotEquals(normaliseSpokenEs("un gato"), normaliseSpokenEs("1 gato"));
  assertNotEquals(normaliseSpokenEs("una casa"), normaliseSpokenEs("1 casa"));
  assertEquals(normaliseSpokenEs("un gato"), normaliseSpokenEs("un gato"));
});

Deno.test("matchesSpokenAnswerEs matches round hundred/thousand", () => {
  assertEquals(matchesSpokenAnswerEs("hay cien personas", "Hay 100 personas."), true);
  assertEquals(matchesSpokenAnswerEs("hay mil personas", "Hay 1000 personas."), true);
});

Deno.test("normaliseSpokenEs strips the silent h before the filler check runs", () => {
  assertEquals(normaliseSpokenEs("dehesa"), normaliseSpokenEs("deesa"));
});
