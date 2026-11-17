import { describe, expect, it } from "vitest";
import { looksPersonal, parseRecap, type Turn } from "./call-recap";
import { normalizeForScan } from "./text-normalize";

const NBSP = " ";
const ZW = "​";

describe("looksPersonal: ways of writing personal details that must be caught", () => {
  it.each([
    ["email, words for the symbols", "write to john at gmail dot com please"],
    ["email, bracket symbols", "john (at) gmail (dot) com"],
    ["email, Spanish words", "escribe a ana arroba hotmail punto es"],
    ["email, plain", "ana.perez@example.com"],
    ["domain spelled with dot word", "visit evil dot io today"],
    ["digits spelled out, English", "call me on five five five one two three four"],
    ["digits spelled out, Spanish", "mi numero es seis uno dos tres cuatro cinco seis"],
    ["digits spelled out, French", "mon numero est zéro six un deux trois quatre"],
    ["full-width digits", "my id is １２３４５６７８"],
    ["name intro, English full name", "I'm John Smith and I has a dog"],
    ["name intro, I am", "I am Mary Jane Watson"],
    ["name intro, Spanish", "soy Carlos Perez"],
    ["name intro, Spanish, sentence case", "Soy Carlos y tengo un perro"],
    ["name intro, French", "je suis Marie Dupont"],
    ["name intro, French c'est", "moi c'est Julien"],
    ["name intro, call me", "call me Alex"],
    ["name intro, my name is", "my name is Ana"],
    ["name intro, double space", "my  name   is Ana"],
    ["name intro, no-break space", `my${NBSP}name${NBSP}is Ana`],
    ["name intro, zero-width", `my na${ZW}me is Ana`],
    ["name intro, full-width letters", "ｍｙ ｎａｍｅ ｉｓ Ana"],
    ["password, English", "my password is hunter2"],
    ["password, Spanish", "mi contraseña es rosa"],
    ["password, French", "mon mot de passe est rose"],
    ["school, named", "I go to Lincoln High School"],
    ["school, possessive", "my school is near here"],
    ["school, Spanish", "estudio en la Universidad Complutense"],
    ["school, French", "mon lycée est grand"],
  ])("%s", (_n, text) => {
    expect(looksPersonal(text)).toBe(true);
  });
});

describe("looksPersonal: ordinary learner text that must stay", () => {
  it.each([
    "I have 3 cats",
    "Tengo 3 gatos hoy",
    "comb your hair",
    "I score at tennis",
    "I'm tired today",
    "I'm English and I like tea",
    "I'm very happy",
    "she is at home",
    "meet me at the station",
    "He said yes, and I said no",
    "Soy feliz hoy",
    "je suis fatigué",
    "this is a book",
    "one two three",
    "I have one cat, two dogs and three birds",
    "He arrived at noon. Then he left.",
    "the school bus is late",
    "I have a company car",
    "Ella tiene un perro",
  ])("%j", (text) => {
    expect(looksPersonal(text)).toBe(false);
  });
});

describe("normalizeForScan", () => {
  it("folds spaces, invisible characters and full-width forms, and keeps case", () => {
    expect(normalizeForScan(`  Ａb${ZW}c${NBSP}${NBSP}d \n e `)).toBe("Abc d e");
  });
});

describe("the filter runs on every text field that can reach the card or the memory", () => {
  const turns: Turn[] = [
    { role: "user", content: "I go to school yesterday" },
    { role: "assistant", content: "Nice to meet you" },
  ];
  const base = {
    said: "I go to school yesterday",
    fixed: "I went to school yesterday",
    why: "Past tense",
    topic: "past-tense",
    wrong: ["I goed to school yesterday", "I going to school yesterday"],
  };
  const run = (corr: Partial<typeof base>) =>
    parseRecap(JSON.stringify({ corrections: [{ ...base, ...corr }], phrase: null }), turns, "en")!;

  it("keeps the clean baseline", () => {
    expect(run({}).corrections).toHaveLength(1);
  });
  it("drops a correction whose why is personal", () => {
    expect(run({ why: "call me Alex" }).corrections).toEqual([]);
  });
  it("drops a correction whose wrong answer is personal", () => {
    expect(
      run({ wrong: ["write john at gmail dot com", "I going to school yesterday"] }).corrections,
    ).toEqual([]);
  });
  it("drops a correction whose fixed text is personal", () => {
    expect(run({ fixed: "I'm John Smith, I went to school yesterday" }).corrections).toEqual([]);
  });

  const phrase = (p: Partial<{ text: string; meaning: string; wrong: string[] }>) =>
    parseRecap(
      JSON.stringify({
        corrections: [],
        phrase: {
          text: "Nice to meet you",
          meaning: "a greeting",
          wrong: ["a goodbye", "a thanks", "an apology"],
          ...p,
        },
      }),
      turns,
      "en",
    )!.phrase;

  it("keeps a clean phrase", () => {
    expect(phrase({})).not.toBeNull();
  });
  it("drops a phrase whose meaning is personal", () => {
    expect(phrase({ meaning: "my password is rose" })).toBeNull();
  });
  it("drops a phrase whose wrong answer is personal", () => {
    expect(phrase({ wrong: ["a goodbye", "call me Alex", "an apology"] })).toBeNull();
  });
});
