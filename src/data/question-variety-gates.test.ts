// Quality gates for the questions question-variety.ts appends (review of PR 378): a reorder sentence
// has one natural order, a listening question can be answered by ear, a translate question accepts
// the obvious natural wordings. The checks run on the real curriculum and on named examples, so a
// gate that stopped flagging anything would fail the "catches" tests.

import { describe, expect, it } from "vitest";
import { matchesAcceptableAnswer } from "../lib/translation-answer";
import { curriculum, rawCurriculum } from "./curriculum";
import { applyQuestionFixes } from "./question-fixes";
import { REVIEWED_WORDS } from "./question-variety-authored";
import {
  knownWordsOf,
  listeningChoiceProblems,
  movableAdverbial,
  soundsAlike,
  wordsOf,
} from "./question-variety-gate";

const fixed = applyQuestionFixes(rawCurriculum);
const lessonsOf = (units: typeof curriculum) =>
  units
    .filter((u) => u.level === "A1" || u.level === "A2")
    .flatMap((u) => u.lessons.map((lesson) => ({ unit: u, lesson })));

const added = lessonsOf(curriculum).flatMap(({ lesson }) =>
  lesson.questions.filter((q) => /^a[12]p\d+q(2[5-9]|3\d)$/.test(q.id)).map((q) => ({ lesson, q })),
);
// The overlay writes American English (review-fixes/en.json), so its words count as known too.
const knownWords = new Set([...knownWordsOf(fixed, REVIEWED_WORDS), ...knownWordsOf(curriculum)]);
const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, "")
    .trim();

describe("reorder sentences have one natural order", () => {
  it("the detector flags the sentences the review found and spares fixed-order ones", () => {
    for (const s of [
      "We were living in Rome then",
      "We play board games on rainy days",
      "She can speak three languages fluently",
      "I make my bed every morning",
      "The weather is worse today",
      "Birds fly south in winter",
      "The shortest month of the year is February",
      "Take your umbrella — it might rain",
      "Can I try this on",
      "We cook potatoes for dinner",
      "He was sleeping when the alarm went off",
      "She sits beside me in class",
    ])
      expect(movableAdverbial(s), s).not.toBeNull();
    for (const s of [
      "Put the book on the shelf",
      "The keys are on the table",
      "How often do you brush your teeth",
      "I never eat fish",
      "She has a car",
      "Where do you live",
      "What is the meeting about",
    ])
      expect(movableAdverbial(s), s).toBeNull();
  });

  it("no appended reorder sentence has a movable time, place, frequency or manner adverbial", () => {
    const bad = added
      .filter(({ q }) => q.type === "reorder")
      .map(({ q }) => {
        const answer = (q as { answer: string }).answer;
        return [q.id, answer, movableAdverbial(answer)];
      })
      .filter(([, , m]) => m);
    expect(bad).toEqual([]);
  });

  it("the as...as and comparative lessons reorder a sentence that uses the structure", () => {
    const reorderOf = (id: string) =>
      (
        added.find(({ lesson, q }) => lesson.id === id && q.type === "reorder")?.q as
          { answer: string } | undefined
      )?.answer ?? "";
    for (let n = 1; n <= 5; n++) {
      expect(reorderOf(`a2p20l${n}`), `a2p20l${n}`).toMatch(/\bas \w+ as\b/i);
      expect(reorderOf(`a2p3l${n}`), `a2p3l${n}`).toMatch(/\bthan\b/i);
    }
  });

  it("a1p9q37 is not a sentence that reads the same the other way round", () => {
    const hit = added.find(({ q }) => q.id === "a1p9q37")!.q as { answer: string };
    expect(hit.answer).not.toMatch(/\bmatch/i);
    expect(movableAdverbial(hit.answer)).toBeNull();
  });

  it("reorder and listening of one lesson never repeat the same sentence", () => {
    for (const { lesson } of lessonsOf(curriculum)) {
      const mine = added.filter((a) => a.lesson === lesson).map((a) => a.q);
      const reorder = mine.find((q) => q.type === "reorder") as { answer: string } | undefined;
      const listening = mine.find((q) => q.type === "listening") as
        { audioText: string } | undefined;
      if (reorder && listening)
        expect(key(reorder.answer), lesson.id).not.toBe(key(listening.audioText));
    }
  });
});

describe("listening: wrong choices can be told apart by ear", () => {
  it("the checks catch misspellings, homophones and unrelated sentences", () => {
    const answer = "The leaves fall in autumn.";
    expect(
      listeningChoiceProblems(answer, "The leavs fall in autumn.", knownWords).join(),
    ).toContain("leavs");
    expect(
      listeningChoiceProblems(
        "This is the simplest game to learn.",
        "This is the simpleer game to learn.",
        knownWords,
      ).join(),
    ).toContain("simpleer");
    expect(
      listeningChoiceProblems("The sheep eat grass.", "The sheepen eat grass.", knownWords).join(),
    ).toContain("sheepen");
    expect(
      listeningChoiceProblems("This is more expensive.", "This is expensiver.", knownWords).length,
    ).toBeGreaterThan(0);
    // homophones and one-sound differences
    expect(soundsAlike("their", "there")).toBe(true);
    expect(soundsAlike("write", "right")).toBe(true);
    expect(soundsAlike("fifteen", "fifty")).toBe(true);
    expect(soundsAlike("walk", "walks")).toBe(true);
    expect(soundsAlike("hottest", "wettest")).toBe(true);
    expect(soundsAlike("autumn", "winter")).toBe(false);
    expect(soundsAlike("hill", "road")).toBe(false);
    // unrelated whole sentences are not "confusable"
    expect(
      listeningChoiceProblems(
        "I call my old friend now and then.",
        "The bank closes at five o'clock.",
        knownWords,
      ),
    ).toContain("not a close variant of the answer");
    // a fair wrong choice has no problem
    expect(listeningChoiceProblems(answer, "The leaves fall in winter.", knownWords)).toEqual([]);
  });

  it("every wrong choice is correctly spelled English, a close variant, and does not sound like the answer", () => {
    const bad: string[] = [];
    for (const { q } of added) {
      if (q.type !== "listening") continue;
      expect(q.choices.length, q.id).toBe(4);
      for (const c of q.choices) {
        if (c === q.answer) continue;
        const problems = listeningChoiceProblems(q.answer, c, knownWords);
        if (problems.length) bad.push(`${q.id} "${c}": ${problems.join("; ")}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("the reviewed word list holds only words a wrong choice uses", () => {
    const used = new Set(
      added.flatMap(({ q }) =>
        q.type === "listening" ? q.choices.flatMap((c) => wordsOf(c)) : [],
      ),
    );
    expect(REVIEWED_WORDS.filter((w) => !used.has(w))).toEqual([]);
  });
});

describe("translate accepts the obvious natural wordings", () => {
  const wordings = (lessonId: string) => {
    const hit = added.find(({ lesson, q }) => lesson.id === lessonId && q.type === "translate")!;
    return (hit.q as { acceptableAnswers: string[] }).acceptableAnswers;
  };
  const accepts = (lessonId: string, said: string) =>
    matchesAcceptableAnswer(said, wordings(lessonId));

  it("accepts please on every ask/tell prompt, and the bare request without it", () => {
    let seen = 0;
    for (const { q } of added) {
      if (q.type !== "translate" || !/^(Ask|Tell)\b/.test(q.prompt)) continue;
      seen++;
      expect(
        q.acceptableAnswers.some((x) => /\bplease\b/i.test(x)),
        q.id,
      ).toBe(true);
      expect(
        q.acceptableAnswers.some((x) => !/\bplease\b/i.test(x)),
        q.id,
      ).toBe(true);
    }
    expect(seen).toBeGreaterThanOrEqual(27);
  });

  it("accepts the wordings the review found missing", () => {
    expect(accepts("a1p16l4", "She does the shopping on Saturday.")).toBe(true);
    expect(accepts("a1p16l4", "She does the shopping every Saturday.")).toBe(true);
    expect(accepts("a2p18l5", "I was watching television when my friend came.")).toBe(true);
    expect(accepts("a2p18l5", "I was watching TV when my friend came over.")).toBe(true);
    expect(accepts("a2p9l4", "She has a sore foot.")).toBe(true);
    expect(accepts("a2p9l4", "She has got a pain in her foot.")).toBe(true);
    expect(accepts("a2p4l2", "Is this bus going to the airport?")).toBe(true);
    expect(accepts("a2p4l2", "Does this bus go to the airport, please?")).toBe(true);
    expect(accepts("a1p17l1", "Could you please repeat the question?")).toBe(true);
    expect(accepts("a2p13l1", "Turn right at the lights, please.")).toBe(true);
    expect(accepts("a1p22l4", "I cook with my mom on Sundays.")).toBe(true);
    expect(accepts("a2p17l4", "The church is next to the school.")).toBe(true);
  });

  it("does not accept wordings that say something else", () => {
    // "the book" is not "a book" (a2p17q27 used to accept "There is a book on the desk")
    expect(accepts("a2p17l1", "There is a book on the desk.")).toBe(false);
    expect(accepts("a2p17l1", "The book is on the table.")).toBe(false);
    expect(accepts("a2p3l1", "My brother is taller than you.")).toBe(false);
    expect(accepts("a1p9l1", "My new shoes are too tight.")).toBe(false);
    expect(accepts("a1p19l4", "The apples are on sale this week.")).toBe(false);
    expect(accepts("a1p16l4", "She does the shopping on Sundays.")).toBe(false);
    expect(accepts("a1p19l5", "Can I have a coat, please?")).toBe(false);
  });
});
