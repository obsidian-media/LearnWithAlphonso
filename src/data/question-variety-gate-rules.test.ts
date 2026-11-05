// Every rule of the question-variety gates has a fixture only that rule catches, so deleting or
// weakening any one rule turns a test red (the earlier tests could be satisfied by a neighbouring
// rule: "sheepen" is also a sound-alike, "I sometimes walk" was caught by nothing).

import { describe, expect, it } from "vitest";
import { curriculum } from "./curriculum";
import {
  MOVABLE_RULES,
  choiceFormatProblems,
  grammarOnlyProblems,
  isGrammarSlip,
  listeningChoiceProblems,
  movableAdverbial,
  movableRuleHits,
  wordsOf,
} from "./question-variety-gate";
import { TRANSLATE_IDEAS } from "./question-variety-translate";

const added = curriculum
  .filter((u) => u.level === "A1" || u.level === "A2")
  .flatMap((u) => u.lessons)
  .flatMap((lesson) =>
    lesson.questions
      .filter((q) => /^a[12]p\d+q(2[5-9]|3\d)$/.test(q.id))
      .map((q) => ({ lesson, q })),
  );

/** rule name -> a sentence that exactly this rule flags */
const RULE_FIXTURES: Record<string, string> = {
  "time-adverb": "I walk tomorrow",
  "time-clause": "I read if I can",
  "this-next-every": "I swim this summer",
  "on-day": "On Mondays I swim",
  "in-month": "In July I swim",
  "on-days": "On rainy days I swim",
  "at-night": "At night I swim",
  oclock: "Nine o'clock arrives",
  "at-time": "At nine I swim",
  "for-day": "I wait for Friday",
  "for-duration": "I wait for two hours",
  "early-late": "I wake up late",
  "all-day": "I swim all day",
  "for-meal": "I eat fish for lunch",
  "due-to": "Due to rain I stay",
  "frequency-adverb": "I sometimes walk",
  "frequency-phrase": "I swim once",
  "times-a": "I swim three times a week",
  "place-adverb": "She lives nearby",
  "place-phrase": "She plays in the park",
  "clause-swap": "Take an umbrella — it might rain",
  particle: "Can I try this on",
  "purpose-clause": "Doctors work to save lives",
  "symmetric-relation": "I like tea but not milk",
  "gerund-subject": "Swimming is good exercise",
  "two-things-spatial": "The car park is under the shopping centre",
  "is-proper-noun": "The shortest month is February",
  "ly-adverb": "She speaks gently",
};

describe("reorder gate: each rule has a fixture only it catches", () => {
  it("has a fixture for every rule", () => {
    const names = [...MOVABLE_RULES.map((r) => r.name), "is-proper-noun", "ly-adverb"];
    expect(Object.keys(RULE_FIXTURES).sort()).toEqual([...names].sort());
  });
  for (const [name, sentence] of Object.entries(RULE_FIXTURES))
    it(`${name}: "${sentence}" is flagged by that rule alone`, () => {
      expect(movableRuleHits(sentence)).toEqual([name]);
    });

  it("flags symmetric relations: two things that can swap places", () => {
    for (const s of [
      "The school is next to the park",
      "This one is as heavy as that bag",
      "Climbing is fun but hard",
      "The bank is opposite the cafe",
      "The hotel is near the city centre",
      "My room is bigger than yours",
      "She plays the guitar and loves music",
      "Gardening is her favourite hobby",
      // "X matches Y" reads the same the other way round
      "These socks don't match my shoes",
      "The curtains match the sofa",
      "Your tie matches your shirt",
      // two noun phrases or possessives can swap; only an object pronoun cannot
      "My bag is heavier than yours",
      "Anna is as tall as Tom",
      "She is taller than her mother",
    ])
      expect(movableAdverbial(s), s).not.toBeNull();
    // an object pronoun at the end cannot take the subject's place, so the other order is not the same words
    for (const s of ["She is happier than him", "I am as tall as her", "He swims further than me"])
      expect(movableAdverbial(s), s).toBeNull();
    for (const s of ["I wash my face", "Go straight ahead", "The keys are on the table"])
      expect(movableAdverbial(s), s).toBeNull();
  });
});

describe("listening gate: each check has a fixture only it catches", () => {
  const known = (...s: string[]) => new Set(s.flatMap(wordsOf));
  it("a misspelled word alone", () => {
    const answer = "The cat sat on the mat.";
    const wrong = "The cat sat on the zork.";
    expect(listeningChoiceProblems(answer, wrong, known(answer, "the"))).toEqual([
      '"zork" is not a word the course spells',
    ]);
  });
  it("a word that sounds like the answer alone", () => {
    const answer = "Put it there.";
    const wrong = "Put it their.";
    expect(listeningChoiceProblems(answer, wrong, known(answer, wrong))).toEqual([
      '"their" sounds or looks like "there"',
    ]);
  });
  it("an unrelated sentence alone", () => {
    const answer = "The cat sat.";
    const wrong = "A dog ran far away.";
    expect(listeningChoiceProblems(answer, wrong, known(answer, wrong))).toEqual([
      "not a close variant of the answer",
    ]);
  });
});

describe("listening gate: the choices look alike and are not solved by grammar", () => {
  it("catches a space before the question mark, mixed punctuation and 'can not'", () => {
    expect(
      choiceFormatProblems(["Do you have this?", "Do you have that ?", "Do you have these?"]),
    ).toEqual(['"Do you have that ?" has a space before punctuation']);
    expect(choiceFormatProblems(["I can go.", "I can go"]).length).toBeGreaterThan(0);
    expect(choiceFormatProblems(["They can not go."])).toEqual([
      '"They can not go." writes "cannot" as two words',
    ]);
    expect(choiceFormatProblems(["It is cold.", "It is hot."])).toEqual([]);
  });

  it("catches wrong choices that are all grammar slips, and spares a lexical one", () => {
    expect(isGrammarSlip("We are not ready.", "We is not ready.")).toBe(true);
    expect(isGrammarSlip("He is taking an exam.", "He is took an exam.")).toBe(true);
    expect(isGrammarSlip("It is cold today.", "It is hot today.")).toBe(false);
    expect(
      grammarOnlyProblems("We are not ready.", ["We is not ready.", "We am not ready."]).length,
    ).toBe(1);
    expect(
      grammarOnlyProblems("We are not ready.", ["We is not ready.", "We are not late."]),
    ).toEqual([]);
  });

  it("every appended listening question has aligned choices and at least one grammatical wrong choice", () => {
    const bad: string[] = [];
    for (const { q } of added) {
      if (q.type !== "listening") continue;
      const wrongs = q.choices.filter((c) => c !== q.answer);
      for (const p of [
        ...choiceFormatProblems(q.choices),
        ...grammarOnlyProblems(q.answer, wrongs),
      ])
        bad.push(`${q.id}: ${p}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("translate guard: confusable pairs are never accepted for each other", () => {
  // the canonical wording holds the first word; no accepted wording may use the second without the first
  const PAIRS: [RegExp, RegExp][] = [
    [/\btoo\b/, /\b(very|really)\b/],
    [/\bbuy\b/, /\bbought\b/],
    [/\bopposite\b/, /\bin front of\b/],
    [/\boften\b/, /\busually\b/],
    [/\bsometimes\b/, /\b(often|usually)\b/],
    // "need" says it is necessary; "want" only says you would like it
    [/\bneed\b/, /\bwant\b/],
  ];
  it("catches an over-accept", () => {
    const canonical = "The soup is too hot.";
    const bad = ["The soup is very hot."];
    const [a, b] = PAIRS[0]!;
    expect(a.test(canonical) && bad.some((x) => b.test(x) && !a.test(x))).toBe(true);
  });
  it("catches 'want' accepted for 'need'", () => {
    const [a, b] = PAIRS[PAIRS.length - 1]!;
    expect(a.test("I need a taxi to the station.")).toBe(true);
    expect(
      b.test("I want a taxi to the station.") && !a.test("I want a taxi to the station."),
    ).toBe(true);
  });
  it("a1p20q36 and a2p15q36 accept no 'want' wording", () => {
    for (const id of ["a1p20q36", "a2p15q36"]) {
      const hit = added.find(({ q }) => q.id === id);
      expect(hit, id).toBeTruthy();
      const q = hit!.q as { acceptableAnswers: string[] };
      expect(
        q.acceptableAnswers.filter((x) => /\bwant\b/i.test(x)),
        id,
      ).toEqual([]);
    }
  });
  it("no appended translate question accepts one for the other", () => {
    const bad: string[] = [];
    for (const { lesson, q } of added) {
      if (q.type !== "translate") continue;
      const canonical = TRANSLATE_IDEAS[lesson.id]!.say[0]!.toLowerCase();
      for (const [a, b] of PAIRS) {
        if (!a.test(canonical) || b.test(canonical)) continue;
        for (const x of q.acceptableAnswers) {
          const lower = x.toLowerCase();
          if (b.test(lower) && !a.test(lower)) bad.push(`${q.id}: "${x}"`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
