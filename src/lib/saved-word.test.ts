import { describe, expect, it } from "vitest";
import {
  SAVED_WORD_LIMIT,
  buildSavedWordCard,
  parseDefinition,
  validateSavedWordInput,
} from "./saved-word";

const good = { word: "serendipity", sentence: "It was pure serendipity.", course: "en" };

describe("validateSavedWordInput", () => {
  it("accepts a normal word and trims it", () => {
    const r = validateSavedWordInput({
      ...good,
      word: "  serendipity ",
      sentence: " It was pure serendipity. ",
    });
    expect(r).toEqual({ ok: true, value: { ...good } });
  });

  it.each(["l'été", "don't", "don’t", "well-known", "Été", "naïve"])("accepts %s", (word) => {
    const r = validateSavedWordInput({ word, sentence: `a ${word} b`, course: "fr" });
    expect(r.ok).toBe(true);
  });

  it.each(["", "   ", "two words", "abc1", "-start", "'start", "a".repeat(41), "x_y", "a/b"])(
    "rejects the word %j",
    (word) => {
      expect(validateSavedWordInput({ ...good, word, sentence: `${word} here` }).ok).toBe(false);
    },
  );

  it("requires the sentence to contain the word, ignoring case", () => {
    expect(validateSavedWordInput({ ...good, sentence: "Nothing relevant here." }).ok).toBe(false);
    expect(validateSavedWordInput({ ...good, sentence: "SERENDIPITY happens." }).ok).toBe(true);
  });

  it("rejects an empty or over-long sentence", () => {
    expect(validateSavedWordInput({ ...good, sentence: "" }).ok).toBe(false);
    expect(
      validateSavedWordInput({ ...good, sentence: `serendipity ${"a".repeat(300)}` }).ok,
    ).toBe(false);
  });

  it("accepts a sentence of exactly 300 characters", () => {
    const sentence = `serendipity${"a".repeat(289)}`;
    expect(sentence.length).toBe(300);
    expect(validateSavedWordInput({ ...good, sentence }).ok).toBe(true);
  });

  it("rejects an unknown course and non-object input", () => {
    expect(validateSavedWordInput({ ...good, course: "de" }).ok).toBe(false);
    expect(validateSavedWordInput(null).ok).toBe(false);
    expect(validateSavedWordInput("serendipity").ok).toBe(false);
    expect(validateSavedWordInput({ word: 5, sentence: "x", course: "en" }).ok).toBe(false);
  });
});

const def = {
  meaning: "a happy accident",
  translation: "a lucky find",
  wrong: ["a sad ending", "a long journey", "a loud noise"],
};
const json = (o: unknown) => JSON.stringify(o);

describe("parseDefinition", () => {
  it("parses plain JSON", () => {
    expect(parseDefinition(json(def))).toEqual(def);
  });

  it("parses JSON inside a code fence", () => {
    expect(parseDefinition("```json\n" + json(def) + "\n```")).toEqual(def);
  });

  it("parses JSON wrapped in prose", () => {
    expect(parseDefinition("Sure! Here you go: " + json(def) + " Hope that helps.")).toEqual(def);
  });

  it("trims whitespace and defaults a missing translation to an empty string", () => {
    const out = parseDefinition(json({ meaning: "  a happy accident ", wrong: [" a ", "b", "c"] }));
    expect(out).toEqual({ meaning: "a happy accident", translation: "", wrong: ["a", "b", "c"] });
  });

  it.each([
    ["not json at all", "no braces here"],
    ["malformed json", "{ meaning: nope"],
    ["missing meaning", json({ wrong: ["a", "b", "c"] })],
    ["empty meaning", json({ meaning: "  ", wrong: ["a", "b", "c"] })],
    ["meaning over 160 chars", json({ meaning: "m".repeat(161), wrong: ["a", "b", "c"] })],
    ["two wrong answers", json({ meaning: "m", wrong: ["a", "b"] })],
    ["four wrong answers", json({ meaning: "m", wrong: ["a", "b", "c", "d"] })],
    ["duplicate wrong answers", json({ meaning: "m", wrong: ["a", "A", "c"] })],
    ["a wrong answer equal to the meaning", json({ meaning: "Happy", wrong: ["happy", "b", "c"] })],
    ["a non-string wrong answer", json({ meaning: "m", wrong: ["a", 2, "c"] })],
    ["a wrong answer over 160 chars", json({ meaning: "m", wrong: ["a", "b", "c".repeat(161)] })],
    ["wrong is not an array", json({ meaning: "m", wrong: "abc" })],
  ])("rejects %s", (_name, text) => {
    expect(parseDefinition(text)).toBeNull();
  });
});

describe("buildSavedWordCard", () => {
  // Deterministic generator so a failure is reproducible.
  function lcg(seed: number) {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  it("always points answerIndex at the right meaning, whatever the shuffle", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const card = buildSavedWordCard({
        word: "serendipity",
        sentence: "x serendipity y",
        definition: def,
        random: lcg(seed),
      });
      expect(card.choices).toHaveLength(4);
      expect(card.choices[card.answerIndex]).toBe(def.meaning);
      expect([...card.choices].sort()).toEqual([def.meaning, ...def.wrong].sort());
    }
  });

  it("actually shuffles (not always the same position)", () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      positions.add(
        buildSavedWordCard({ word: "w", sentence: "w", definition: def, random: lcg(seed) })
          .answerIndex,
      );
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it("asks about the word in its sentence", () => {
    const card = buildSavedWordCard({
      word: "serendipity",
      sentence: "It was pure serendipity.",
      definition: def,
    });
    expect(card.prompt).toBe('What does "serendipity" mean here?\nIt was pure serendipity.');
  });

  it("explains with the meaning and a translation only when it adds something", () => {
    const withTranslation = buildSavedWordCard({ word: "w", sentence: "w", definition: def });
    expect(withTranslation.explanation).toBe('"w" means a happy accident. (a lucky find)');
    const same = buildSavedWordCard({
      word: "w",
      sentence: "w",
      definition: { ...def, translation: "A HAPPY ACCIDENT" },
    });
    expect(same.explanation).toBe('"w" means a happy accident.');
    const none = buildSavedWordCard({
      word: "w",
      sentence: "w",
      definition: { ...def, translation: "" },
    });
    expect(none.explanation).toBe('"w" means a happy accident.');
  });
});

describe("SAVED_WORD_LIMIT", () => {
  it("is 500, the per-course cap the spec sets", () => {
    expect(SAVED_WORD_LIMIT).toBe(500);
  });
});
