import { afterEach, describe, expect, it, vi } from "vitest";
import { decideVerdict, gradeTranslationWithAi } from "./translation-grader.server";

// Open item 96: a distance-1 pair of REAL words (world/word, though/through, cabos/cavos) used to pass when the model
// labelled the slip a spelling slip. A word that is itself a real word of the course's language is a different word.
// The Deno copy is exercised by supabase/functions/_shared/translation-grader.test.ts.
afterEach(() => {
  vi.unstubAllGlobals();
});

const reply = (o: Record<string, unknown>) =>
  JSON.stringify({ elements: ["a"], missing: [], extra: [], grammar: [], correct: true, ...o });

// Every way the model has been seen to call a slip a typo: a spelling entry (either flag, or none), a remark filed
// under another list, a bare "false" that only says misspelled.
const shapes = (w: string, i: string) => [
  { spelling: [{ written: w, intended: i, written_is_real_word: true }] },
  { spelling: [{ written: w, intended: i, written_is_real_word: false }] },
  { spelling: [{ written: w, intended: i }] },
  { missing: [`'${i}' is misspelled as '${w}'`], correct: false },
  { grammar: [`'${w}' is misspelled`], correct: false },
  { correct: false, reason: `'${w}' is misspelled` },
];

describe("a real word is a different word, never a spelling slip", () => {
  it.each([
    ["en", "world", "word", "Say the last word.", "Say the last world."],
    ["en", "though", "through", "I walked through the door.", "I walked though the door."],
    ["en", "through", "though", "I stayed though it rained.", "I stayed through it rained."],
    ["es", "cabos", "cavos", "Los cavos están sueltos.", "Los cabos están sueltos."],
    ["es", "botar", "votar", "Quiero votar mañana.", "Quiero botar mañana."],
    ["fr", "monte", "monde", "Le monde est grand.", "Le monte est grand."],
  ] as const)("%s: keeps %s for %s wrong in every reply shape", (course, w, i, acceptable, sub) => {
    for (const o of shapes(w, i)) {
      expect(decideVerdict(reply(o), [acceptable], sub, course)?.correct, JSON.stringify(o)).toBe(
        false,
      );
    }
  });

  it("names the wrong word in the reason the learner sees", () => {
    const verdict = decideVerdict(
      reply({ spelling: [{ written: "world", intended: "word", written_is_real_word: false }] }),
      ["Say the last word."],
      "Say the last world.",
      "en",
    );
    expect(verdict?.correct).toBe(false);
    expect(verdict?.reason).toContain('"world" is a different word from "word"');
  });

  it.each([
    ["en", "recieve", "receive", "I will receive it.", "I will recieve it."],
    ["en", "gratitute", "gratitude", "I showed my gratitude.", "I showed my gratitute."],
    ["en", "swiming", "swimming", "I like swimming a lot.", "I like swiming a lot."],
    ["en", "begining", "beginning", "I am beginning now.", "I am begining now."],
    ["es", "aprovada", "aprobada", "La ley fue aprobada ayer.", "La ley fue aprovada ayer."],
    ["fr", "demmain", "demain", "Je pars demain matin.", "Je pars demmain matin."],
  ] as const)("%s: still accepts the real typo %s for %s", (course, w, i, acceptable, sub) => {
    for (const o of shapes(w, i)) {
      expect(decideVerdict(reply(o), [acceptable], sub, course)?.correct, JSON.stringify(o)).toBe(
        true,
      );
    }
  });

  it("looks a word up in the course's language only, and treats no course as English", () => {
    // "cabos" is a Spanish word, not an English one: in an English course it is still just a slip.
    const o = { spelling: [{ written: "cabos", intended: "cavos", written_is_real_word: false }] };
    expect(decideVerdict(reply(o), ["Los cavos."], "Los cabos.", "es")?.correct).toBe(false);
    expect(decideVerdict(reply(o), ["Los cavos."], "Los cabos.", "en")?.correct).toBe(true);
    const w = { spelling: [{ written: "world", intended: "word", written_is_real_word: false }] };
    expect(decideVerdict(reply(w), ["Say the last word."], "Say the last world.")?.correct).toBe(
      false,
    );
  });

  it("gradeTranslationWithAi passes the course through to the verdict", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: reply({
                  spelling: [{ written: "cabos", intended: "cavos", written_is_real_word: false }],
                }),
              },
            },
          ],
        }),
      })),
    );
    const args = {
      prompt: "Di los cabos.",
      acceptableAnswers: ["Los cavos."],
      submission: "Los cabos.",
      apiKey: "test-key",
      model: "test-model",
    };
    expect((await gradeTranslationWithAi({ ...args, course: "es" }))?.correct).toBe(false);
    expect((await gradeTranslationWithAi({ ...args, course: "en" }))?.correct).toBe(true);
  });
});
