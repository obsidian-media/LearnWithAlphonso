import { describe, expect, it } from "vitest";
import { getCourse } from "./courses";
import { deriveVocab } from "./vocab";
import type { Level } from "./levels";

/**
 * Quality gate for the word cards' authored meaning and example (English).
 *
 * The cards are derived from quiz questions, which carry no gloss of their word, so
 * the meaning and example are authored on the pack line (see lesson-bank.ts). A
 * level is added to GATED_LEVELS only once EVERY one of its cards passes; the gate
 * then holds it there. Never remove a level, and never loosen a rule to let a card
 * through: fix the card.
 */
const GATED_LEVELS: Level[] = ["A1", "A2"];

const MAX_MEANING_WORDS = 8;
const MAX_EXAMPLE_WORDS = 10;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const tokens = (s: string) => s.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];

/** Is the term, or an inflected form of it, in the sentence? */
function mentionsTerm(sentence: string, term: string): boolean {
  const lower = sentence.toLowerCase().replace(/[’]/g, "'");
  const t = term.toLowerCase().replace(/[’]/g, "'").trim();
  if (lower.includes(t)) return true;
  const sentenceTokens = tokens(lower);
  return tokens(t).every((tt) => {
    const stem = tt.slice(0, Math.max(3, tt.length - 2));
    return sentenceTokens.some((s) => s.startsWith(stem));
  });
}

/** True when the gloss only restates the word (its content words are all forms of the term's words). */
function repeatsTerm(meaning: string, term: string): boolean {
  // A one- or two-letter term ("in", "on") is matched whole, so "inside" is not a repeat of "in".
  const forms = tokens(term).map((t) => ({ t, stem: t.slice(0, Math.max(3, t.length - 2)) }));
  const m = tokens(meaning).filter((w) => !["to", "a", "an", "the"].includes(w));
  return (
    m.length === 0 ||
    m.every((w) => forms.some((f) => (f.t.length <= 2 ? w === f.t : w.startsWith(f.stem))))
  );
}

/** Everything wrong with one card, as short reasons ("" list = clean). */
function cardProblems(card: { term: string; meaning: string; example: string }): string[] {
  const out: string[] = [];
  const { term, meaning, example } = card;
  if (!meaning.trim()) out.push("empty meaning");
  else {
    if (words(meaning).length > MAX_MEANING_WORDS) out.push("meaning over 8 words");
    if (repeatsTerm(meaning, term)) out.push("meaning repeats the word");
  }
  if (!example.trim()) out.push("empty example");
  else {
    if (words(example).length > MAX_EXAMPLE_WORDS) out.push("example over 10 words");
    if (!mentionsTerm(example, term)) out.push("example lacks the word");
  }
  for (const [name, text] of [
    ["meaning", meaning],
    ["example", example],
  ] as const) {
    if (/_{2,}/.test(text)) out.push(`${name} has a blank`);
    if (/→|->/.test(text)) out.push(`${name} has an arrow`);
    if (/is correct here/i.test(text)) out.push(`${name} is the quiz explanation`);
    if (/[()[\]]/.test(text)) out.push(`${name} has a bracket clue`);
  }
  return out;
}

const cards = (level: Level) =>
  getCourse("en")
    .curriculum.filter((u) => u.level === level)
    .flatMap((u) => u.lessons.flatMap((l) => deriveVocab(l).map((c) => ({ ...c, lesson: l.id }))));

describe("cardProblems (the gate's own rules)", () => {
  const ok = { term: "run", meaning: "to move fast on foot", example: "I run every morning." };
  it("passes a good card", () => expect(cardProblems(ok)).toEqual([]));
  it("flags an empty meaning", () =>
    expect(cardProblems({ ...ok, meaning: "" })).toContain("empty meaning"));
  it("flags a long meaning", () =>
    expect(
      cardProblems({ ...ok, meaning: "one two three four five six seven eight nine" }),
    ).toContain("meaning over 8 words"));
  it("flags a meaning that repeats the word", () => {
    expect(cardProblems({ ...ok, meaning: "run" })).toContain("meaning repeats the word");
    expect(cardProblems({ ...ok, meaning: "to run" })).toContain("meaning repeats the word");
  });
  it("flags a long example", () =>
    expect(
      cardProblems({ ...ok, example: "I run and run and run and run and run and run." }),
    ).toContain("example over 10 words"));
  it("flags an example without the word, but accepts an inflected form", () => {
    expect(cardProblems({ ...ok, example: "I walk every morning." })).toContain(
      "example lacks the word",
    );
    expect(cardProblems({ ...ok, example: "She runs every morning." })).toEqual([]);
    expect(cardProblems({ ...ok, term: "study", example: "He studied hard." })).toEqual([]);
  });
  it("flags quiz leftovers", () => {
    expect(cardProblems({ ...ok, example: "I ___ every morning." })).toContain(
      "example has a blank",
    );
    expect(cardProblems({ ...ok, example: "Run → correr" })).toContain("example has an arrow");
    expect(cardProblems({ ...ok, meaning: '"run" is correct here.' })).toContain(
      "meaning is the quiz explanation",
    );
    expect(cardProblems({ ...ok, example: "I run (fast) every day." })).toContain(
      "example has a bracket clue",
    );
  });
});

describe("English word cards have an authored meaning and example", () => {
  for (const level of GATED_LEVELS) {
    it(`every ${level} card is clean`, () => {
      const all = cards(level);
      expect(all.length).toBeGreaterThan(0);
      const bad = all
        .map((c) => ({ c, p: cardProblems(c) }))
        .filter((x) => x.p.length > 0)
        .map((x) => `${x.c.lesson} "${x.c.term}": ${x.p.join(", ")}`);
      expect(bad).toEqual([]);
    });
  }
});
