// Mirrors src/lib/spoken-answer-fr.test.ts's vectors exactly. This file is
// the parity guard: the player grades a spoken answer with the TypeScript
// original and tells the learner the verdict, then this function's copy
// re-derives it server-side. If the two ever disagree the learner is shown
// "Still got it" and has the item lapsed anyway, which is invisible from
// either side alone.
import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { matchesSpokenAnswerFr, normaliseSpokenFr } from "./spoken-answer-fr.ts";

Deno.test("normaliseSpokenFr strips punctuation and case", () => {
  assertEquals(
    normaliseSpokenFr("Bonjour, Comment allez-vous ?!"),
    normaliseSpokenFr("bonjour comment allez vous"),
  );
});

Deno.test("normaliseSpokenFr folds accents rather than deleting them", () => {
  assertEquals(normaliseSpokenFr("l'élève"), normaliseSpokenFr("l'eleve"));
  assertEquals(normaliseSpokenFr("à bientôt"), normaliseSpokenFr("a bientot"));
});

Deno.test("normaliseSpokenFr collapses whitespace", () => {
  assertEquals(normaliseSpokenFr("  bonjour   madame "), normaliseSpokenFr("bonjour madame"));
});

Deno.test("normaliseSpokenFr treats an elided form and its space-separated spelling as the same", () => {
  assertEquals(normaliseSpokenFr("j'ai faim"), normaliseSpokenFr("jai faim"));
  assertEquals(normaliseSpokenFr("j'ai faim"), normaliseSpokenFr("j ai faim"));
  assertEquals(normaliseSpokenFr("l'école"), normaliseSpokenFr("l ecole"));
  assertEquals(normaliseSpokenFr("c'est"), normaliseSpokenFr("c est"));
  assertEquals(normaliseSpokenFr("qu'est-ce que c'est"), normaliseSpokenFr("qu est ce que c est"));
});

Deno.test("normaliseSpokenFr elides si only before il/ils, not before other vowel-initial words", () => {
  assertEquals(normaliseSpokenFr("s'il vous plaît"), normaliseSpokenFr("s il vous plait"));
  assertEquals(normaliseSpokenFr("s'ils viennent"), normaliseSpokenFr("s ils viennent"));
  assertNotEquals(normaliseSpokenFr("si elle vient"), normaliseSpokenFr("s elle vient"));
  assertEquals(normaliseSpokenFr("si elle vient"), normaliseSpokenFr("si elle vient"));
});

Deno.test("matchesSpokenAnswerFr accepts the expected phrase however the elision was transcribed", () => {
  assertEquals(matchesSpokenAnswerFr("J'ai faim.", "j'ai faim"), true);
  assertEquals(matchesSpokenAnswerFr("j ai faim", "J'ai faim."), true);
  assertEquals(matchesSpokenAnswerFr("jai faim", "J'ai faim."), true);
});

Deno.test("matchesSpokenAnswerFr forgives a leading filler word", () => {
  assertEquals(matchesSpokenAnswerFr("euh, bonjour", "Bonjour."), true);
  assertEquals(matchesSpokenAnswerFr("hum bonjour", "Bonjour."), true);
});

Deno.test("matchesSpokenAnswerFr rejects a different sentence", () => {
  assertEquals(matchesSpokenAnswerFr("il est fatigué", "Elle est fatiguée."), false);
});

Deno.test("matchesSpokenAnswerFr rejects a partial attempt", () => {
  assertEquals(matchesSpokenAnswerFr("bonjour", "Bonjour, comment allez-vous ?"), false);
});

Deno.test("matchesSpokenAnswerFr treats an empty transcript as no answer", () => {
  assertEquals(matchesSpokenAnswerFr("", "Bonjour."), false);
  assertEquals(matchesSpokenAnswerFr("   ", "Bonjour."), false);
});

Deno.test("matchesSpokenAnswerFr matches a number word against the numeral Deepgram returns", () => {
  assertEquals(matchesSpokenAnswerFr("j'ai deux frères", "J'ai 2 frères."), true);
  assertEquals(matchesSpokenAnswerFr("il est cinq heures", "Il est 5 heures."), true);
  assertEquals(matchesSpokenAnswerFr("j'ai trois frères", "J'ai deux frères."), false);
});

Deno.test("matchesSpokenAnswerFr does NOT map un/une to 1", () => {
  assertNotEquals(normaliseSpokenFr("un chat"), normaliseSpokenFr("1 chat"));
  assertEquals(normaliseSpokenFr("un chat"), normaliseSpokenFr("un chat"));
});

Deno.test("matchesSpokenAnswerFr does not corrupt real words that contain a filler as a substring", () => {
  assertEquals(matchesSpokenAnswerFr("un être humain", "Un être humain."), true);
  assertEquals(matchesSpokenAnswerFr("il est de bonne humeur", "Il est de bonne humeur."), true);
});
