import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_LISTEN_AGAIN,
  WORD_CONFIDENCE,
  checkPhrase,
  phraseTokens,
  type HeardWord,
  type PhraseCheck,
} from "./phrase-check";

type Case = {
  expected: string;
  heard: string;
  words: HeardWord[] | null;
  want: PhraseCheck;
};

const cases: Case[] = JSON.parse(
  readFileSync(new URL("../../tests/fixtures/phrase-check-cases.json", import.meta.url), "utf8"),
);

describe("the shared phrase-check cases (the iOS and Android ports pass these same ones)", () => {
  it("has enough cases across the three results", () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
    for (const r of ["clear", "mostly", "not_yet"]) {
      expect(cases.some((c) => c.want.result === r)).toBe(true);
    }
  });
  it.each(cases.map((c, i) => [`${i}: ${c.expected}`, c] as const))("%s", (_name, c) => {
    expect(checkPhrase(c.expected, c.heard, c.words)).toEqual(c.want);
  });
});

describe("the documented thresholds", () => {
  it("pins the numbers the natives copy", () => {
    expect(WORD_CONFIDENCE).toBe(0.7);
    expect(MAX_LISTEN_AGAIN).toBe(2);
  });
  const w = (c: number): HeardWord[] => [
    { word: "good", confidence: 0.99 },
    { word: "morning", confidence: c },
  ];
  it("a word exactly at the confidence line is clear, just under it is not", () => {
    expect(checkPhrase("Good morning", "good morning", w(0.7)).result).toBe("clear");
    expect(checkPhrase("Good morning", "good morning", w(0.6999)).result).toBe("mostly");
  });
  it("never names more than two words, even when the phrase is long enough for more", () => {
    const three = checkPhrase(
      "one two three four five six seven eight",
      "one two three four five six seven eight",
      [
        { word: "one", confidence: 0.1 },
        { word: "two", confidence: 0.1 },
        { word: "three", confidence: 0.1 },
      ],
    );
    expect(three).toEqual({ result: "not_yet", listenAgain: [] });
    const two = checkPhrase("one two three four five six", "one two three four five six", [
      { word: "one", confidence: 0.1 },
      { word: "two", confidence: 0.1 },
    ]);
    expect(two).toEqual({ result: "mostly", listenAgain: ["one", "two"] });
  });
  it("is not mostly when more than half the words are flagged", () => {
    expect(checkPhrase("open an account", "open", null).result).toBe("not_yet");
  });
});

describe("how words are matched", () => {
  it("ignores accents, case and punctuation, and answers in the expected spelling", () => {
    expect(
      checkPhrase("Où ÊTES-vous ?", "OU etes vous", [{ word: "etes", confidence: 0.2 }]),
    ).toEqual({ result: "mostly", listenAgain: ["ÊTES-vous"] });
  });
  it("forgives the elisions l' d' j' however the recogniser writes them", () => {
    for (const heard of ["l amie de j ai", "lamie de jai", "l'amie de j'ai", "amie de ai"]) {
      expect(checkPhrase("L'amie de J'ai", heard, null).result).toBe("clear");
    }
    expect(checkPhrase("L’amie d’Ana", "lamie dana", null).result).toBe("clear");
  });
  it("tokenises predictably", () => {
    expect(phraseTokens("Qu’est-ce que c’est ?")).toEqual(["est", "ce", "que", "est"]);
    expect(phraseTokens("Mon cœur — I'm Æon")).toEqual(["mon", "coeur", "im", "aeon"]);
  });
  it("keeps digits (even one), joins contraction endings and drops elision pieces", () => {
    expect(phraseTokens("Room 4, can't")).toEqual(["room", "4", "cant"]);
    expect(phraseTokens("J'ai l'amie d'accord")).toEqual(["ai", "amie", "accord"]);
  });
  it("uses the exact whitespace list: NBSP, narrow NBSP and BOM all separate words", () => {
    expect(
      checkPhrase("Bonjour madame merci﻿beaucoup", "bonjour madame merci beaucoup", null).result,
    ).toBe("clear");
  });
  it("is not fooled by a number word that is not the same number", () => {
    expect(checkPhrase("seven tickets", "8 tickets", null)).toEqual({
      result: "mostly",
      listenAgain: ["seven"],
    });
    expect(checkPhrase("seven tickets", "seven tickets", null).result).toBe("clear");
  });
  it("matches a number word only to digits, never to a different word of the same value", () => {
    expect(checkPhrase("seven tickets", "siete tickets", null).result).toBe("mostly");
  });
  it("breaks a tie between heard tokens by the lowest index (the first one's confidence counts)", () => {
    const words = [
      { word: "no", confidence: 0.2 },
      { word: "no", confidence: 0.99 },
    ];
    expect(checkPhrase("no", "no no", words)).toEqual({ result: "not_yet", listenAgain: [] });
    expect(checkPhrase("no please", "no no please", words).result).toBe("mostly");
  });
  it("skips a confidence that is not a finite number", () => {
    expect(
      checkPhrase("good morning", "good morning", [
        { word: "morning", confidence: Number.NaN },
        { word: "good", confidence: Number.POSITIVE_INFINITY },
      ]).result,
    ).toBe("clear");
  });
  it("checks the value of a digit against the number word the other way round too", () => {
    expect(checkPhrase("room 12 please", "room thirteen please", null)).toEqual({
      result: "mostly",
      listenAgain: ["12"],
    });
  });
  it("lets a glued elision claim only a word that was elided in the expected text", () => {
    expect(checkPhrase("I like it", "i like lit", null)).toEqual({
      result: "mostly",
      listenAgain: ["it"],
    });
    expect(checkPhrase("J'aime ca", "jaime ca", null).result).toBe("clear");
  });
  it("names a word after a no-break space on its own, not glued to its neighbour", () => {
    const nbsp = String.fromCharCode(160);
    expect(checkPhrase("Bonjour" + nbsp + "madame merci", "bonjour merci", null)).toEqual({
      result: "mostly",
      listenAgain: ["madame"],
    });
  });
  it("keeps a combining mark at the end of a word when showing it", () => {
    const shown = "cafe" + String.fromCharCode(0x301);
    expect(checkPhrase(shown + " noir", "noir", null).listenAgain).toEqual([shown]);
  });
  it("treats a missing or malformed confidence list as unknown, not as unclear", () => {
    expect(checkPhrase("Good morning", "good morning", undefined).result).toBe("clear");
    expect(
      checkPhrase("Good morning", "good morning", [
        { word: "morning" } as unknown as HeardWord,
        null as unknown as HeardWord,
      ]).result,
    ).toBe("clear");
  });
  it("matches repeated words one for one", () => {
    expect(checkPhrase("no no no", "no no", null)).toEqual({
      result: "mostly",
      listenAgain: ["no"],
    });
    expect(checkPhrase("no no no", "no", null)).toEqual({ result: "not_yet", listenAgain: [] });
  });
  it("names words in phrase order with the expected spelling", () => {
    expect(checkPhrase("Please call Dr. Ng soon today", "call dr soon today", null)).toEqual({
      result: "mostly",
      listenAgain: ["Please", "Ng"],
    });
  });
});
