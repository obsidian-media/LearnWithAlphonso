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
const GATED_LEVELS: Level[] = ["A1", "A2", "B1"];

const MAX_MEANING_WORDS = 8;
/** A1 to B1 examples stay short; B2 and C1 sentences need a few more words to sound natural. */
const maxExampleWords = (level: Level) => (level === "B2" || level === "C1" ? 12 : 10);

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
const tokens = (s: string) => s.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s: string) => s.toLowerCase().replace(/[’]/g, "'");
/** Endings a short word may take and still count as the same word ("run" / "runs" / "running"). */
const SHORT_ENDINGS = "(?:s|es|d|ed|ing|'s|'d|'ll|n't)?";
/** A whole-word match for a short word, so "on" is not found in "London" or "at" in "cat". */
const shortWord = (w: string) => new RegExp(`(?<![a-z'])${esc(w)}${SHORT_ENDINGS}(?![a-z])`);
const isShort = (w: string) => w.length <= 3;
const stemOf = (w: string) => w.slice(0, Math.max(3, w.length - 2));
/** Does this sentence word belong to the term word (whole word if short, shared stem otherwise)? */
const sameWord = (sentenceWord: string, termWord: string) =>
  isShort(termWord)
    ? shortWord(termWord).test(sentenceWord)
    : sentenceWord.startsWith(stemOf(termWord));

/** Is the term, or an inflected form of it, in the sentence? */
function mentionsTerm(sentence: string, term: string): boolean {
  const lower = norm(sentence);
  const t = norm(term).trim();
  const phrase = new RegExp(`(?<![a-z'])${esc(t)}(?![a-z])`);
  if (phrase.test(lower)) return true;
  const sentenceTokens = tokens(lower);
  return tokens(t).every((tt) => sentenceTokens.some((s) => sameWord(s, tt)));
}

/**
 * The part of a meaning that DEFINES the word: quoted phrases and "used in ..." / "as in ..."
 * tails only show where the word is used, so the circularity check ignores them.
 */
function definingPart(meaning: string): string {
  return meaning.replace(/["“][^"”]*["”]/g, " ").replace(/(?:^|[;,]) *(?:used|as) in .*$/i, " ");
}

/**
 * True when the meaning defines the word with the word itself ("will" = "what will be true",
 * "fish" = "more than one fish"). A single word is matched whole, with its plain endings and
 * its base form ("drinks" / "drink"); a phrase is matched as a whole phrase. Related words
 * ("rainy" / "rain") are not flagged: that is a gloss, not a circle.
 */
function containsTerm(meaning: string, term: string): boolean {
  const m = norm(definingPart(meaning));
  const t = norm(term).trim();
  const forms = new Set([t, t.replace(/(?:es|s|ed|d|ing)$/, "")]);
  return [...forms].some((f) => f.length >= 2 && shortWord(f).test(m));
}

/** True when the gloss only restates the word (its content words are all forms of the term's words). */
function repeatsTerm(meaning: string, term: string): boolean {
  const forms = tokens(term);
  const m = tokens(meaning).filter((w) => !["to", "a", "an", "the"].includes(w));
  return m.length === 0 || m.every((w) => forms.some((f) => sameWord(w, f)));
}

/** Sentences that describe the word instead of using it: "Used to talks about a past habit." */
const LABEL = /\b(?:talks? about|is an? (?:indirect|polite|formal|informal)|refers? to)\b/i;

/** Everything wrong with one card, as short reasons ("" list = clean). */
function cardProblems(
  card: { term: string; meaning: string; example: string },
  level: Level = "A1",
): string[] {
  const out: string[] = [];
  const { term, meaning, example } = card;
  if (!meaning.trim()) out.push("empty meaning");
  else {
    if (words(meaning).length > MAX_MEANING_WORDS) out.push("meaning over 8 words");
    if (repeatsTerm(meaning, term)) out.push("meaning repeats the word");
    else if (containsTerm(meaning, term)) out.push("meaning contains the word");
  }
  if (!example.trim()) out.push("empty example");
  else {
    if (words(example).length > maxExampleWords(level))
      out.push(`example over ${maxExampleWords(level)} words`);
    if (!mentionsTerm(example, term)) out.push("example lacks the word");
    if (LABEL.test(example)) out.push("example is a label, not a sentence");
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
  it("allows 12 words in a B2 or C1 example but only 10 below", () => {
    const twelve = "I run every single morning before work and then I rest here.";
    expect(words(twelve).length).toBe(12);
    expect(cardProblems({ ...ok, example: twelve }, "B1")).toContain("example over 10 words");
    expect(cardProblems({ ...ok, example: twelve }, "B2")).toEqual([]);
    expect(cardProblems({ ...ok, example: twelve }, "C1")).toEqual([]);
  });
  it("flags an example without the word, but accepts an inflected form", () => {
    expect(cardProblems({ ...ok, example: "I walk every morning." })).toContain(
      "example lacks the word",
    );
    expect(cardProblems({ ...ok, example: "She runs every morning." })).toEqual([]);
    expect(cardProblems({ ...ok, term: "study", example: "He studied hard." })).toEqual([]);
  });
  it("matches a short word whole, not inside another word", () => {
    const at = { term: "at", meaning: "used with clock times", example: "" };
    expect(cardProblems({ ...at, example: "The cat sat down." })).toContain(
      "example lacks the word",
    );
    expect(cardProblems({ ...at, example: "The class starts at nine." })).toEqual([]);
    const on = { term: "on", meaning: "touching the top of", example: "" };
    expect(cardProblems({ ...on, example: "I live in London." })).toContain(
      "example lacks the word",
    );
    expect(cardProblems({ ...on, example: "The book is on the table." })).toEqual([]);
    // an inflected short word still counts
    expect(
      cardProblems({ term: "go", meaning: "to move from here", example: "She goes home." }),
    ).toEqual([]);
  });
  it("flags a meaning that contains the word or its stem", () => {
    const will = { term: "will", example: "He will be twenty next month." };
    expect(cardProblems({ ...will, meaning: "says what will be true later" })).toContain(
      "meaning contains the word",
    );
    expect(cardProblems({ ...will, meaning: "talks about the future" })).toEqual([]);
    const ask = { term: "ask", example: "May I ask a question?" };
    expect(cardProblems({ ...ask, meaning: "to ask someone a question" })).toContain(
      "meaning contains the word",
    );
    // a short word is matched whole: "in" is not in "inside"
    expect(
      cardProblems({ term: "in", meaning: "inside a place", example: "I live in Rome." }),
    ).toEqual([]);
  });
  it("flags an example that describes the word instead of using it", () => {
    expect(cardProblems({ ...ok, example: "Run talks about moving fast." })).toContain(
      "example is a label, not a sentence",
    );
    expect(cardProblems({ ...ok, example: "That is an indirect polite run." })).toContain(
      "example is a label, not a sentence",
    );
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
        .map((c) => ({ c, p: cardProblems(c, level) }))
        .filter((x) => x.p.length > 0)
        .map((x) => `${x.c.lesson} "${x.c.term}": ${x.p.join(", ")}`);
      expect(bad).toEqual([]);
    });
  }
});

describe("a2p12 teaches the adverb, not its gloss", () => {
  const en = getCourse("en");
  const a2p12 = en.curriculum
    .flatMap((u) => u.lessons)
    .filter((l) => l.questions.some((q) => q.id.startsWith("a2p12q")));

  it("the pack exists and every card's term is the frequency adverb", () => {
    const terms = a2p12.flatMap((l) => deriveVocab(l).map((c) => c.term.toLowerCase()));
    expect(terms.length).toBe(25);
    for (const adverb of ["always", "never", "hardly ever", "now and then", "once in a while"]) {
      expect(terms, adverb).toContain(adverb);
    }
    // the old defect: the definition was the term
    expect(terms.filter((t) => t.includes("without exception") || t.includes("almost"))).toEqual(
      [],
    );
  });

  it("the term moves no question, option or answer", () => {
    for (const l of a2p12)
      for (const q of l.questions) {
        expect(q.type === "mc" || q.type === "fill").toBe(true);
        expect(q.prompt).toMatch(/^How often does ".+" happen?/);
      }
  });
});
