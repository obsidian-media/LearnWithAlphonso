// Run with `deno test supabase/functions/_shared/translation-grader-real-word.test.ts`.
// Deno copy of src/lib/translation-grader-real-word.test.ts (open item 96): a real word is a different word, never a
// spelling slip, whatever the model labelled it.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { decideVerdict } from "./translation-grader.ts";

const reply = (o: Record<string, unknown>) =>
  JSON.stringify({ elements: ["a"], missing: [], extra: [], grammar: [], correct: true, ...o });

const shapes = (w: string, i: string) => [
  { spelling: [{ written: w, intended: i, written_is_real_word: true }] },
  { spelling: [{ written: w, intended: i, written_is_real_word: false }] },
  { spelling: [{ written: w, intended: i }] },
  { missing: [`'${i}' is misspelled as '${w}'`], correct: false },
  { grammar: [`'${w}' is misspelled`], correct: false },
  { correct: false, reason: `'${w}' is misspelled` },
];

type Course = "en" | "fr" | "es";

const realWords: [Course, string, string, string, string][] = [
  ["en", "world", "word", "Say the last word.", "Say the last world."],
  ["en", "though", "through", "I walked through the door.", "I walked though the door."],
  ["en", "through", "though", "I stayed though it rained.", "I stayed through it rained."],
  ["es", "cabos", "cavos", "Los cavos están sueltos.", "Los cabos están sueltos."],
  ["es", "botar", "votar", "Quiero votar mañana.", "Quiero botar mañana."],
  ["fr", "monte", "monde", "Le monde est grand.", "Le monte est grand."],
];

for (const [course, w, i, acceptable, sub] of realWords) {
  Deno.test(`${course}: ${w} for ${i} is a different word in every reply shape`, () => {
    for (const o of shapes(w, i)) {
      assertEquals(
        decideVerdict(reply(o), [acceptable], sub, course)?.correct,
        false,
        JSON.stringify(o),
      );
    }
  });
}

const realTypos: [Course, string, string, string, string][] = [
  ["en", "recieve", "receive", "I will receive it.", "I will recieve it."],
  ["en", "gratitute", "gratitude", "I showed my gratitude.", "I showed my gratitute."],
  ["en", "swiming", "swimming", "I like swimming a lot.", "I like swiming a lot."],
  ["en", "begining", "beginning", "I am beginning now.", "I am begining now."],
  ["es", "aprovada", "aprobada", "La ley fue aprobada ayer.", "La ley fue aprovada ayer."],
  ["fr", "demmain", "demain", "Je pars demain matin.", "Je pars demmain matin."],
];

for (const [course, w, i, acceptable, sub] of realTypos) {
  Deno.test(`${course}: the real typo ${w} for ${i} is still accepted in every reply shape`, () => {
    for (const o of shapes(w, i)) {
      assertEquals(
        decideVerdict(reply(o), [acceptable], sub, course)?.correct,
        true,
        JSON.stringify(o),
      );
    }
  });
}

Deno.test(
  "the reason names the wrong word, and the lookup is per course (no course is English)",
  () => {
    const w = { spelling: [{ written: "world", intended: "word", written_is_real_word: false }] };
    const verdict = decideVerdict(reply(w), ["Say the last word."], "Say the last world.");
    assertEquals(verdict?.correct, false);
    assertStringIncludes(verdict?.reason ?? "", '"world" is a different word from "word"');
    const o = { spelling: [{ written: "cabos", intended: "cavos", written_is_real_word: false }] };
    assertEquals(decideVerdict(reply(o), ["Los cavos."], "Los cabos.", "es")?.correct, false);
    assertEquals(decideVerdict(reply(o), ["Los cavos."], "Los cabos.", "en")?.correct, true);
  },
);
