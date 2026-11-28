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
    expect(phraseTokens("Mon cœur — I'm Æon")).toEqual(["mon", "coeur", "aeon"]);
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
