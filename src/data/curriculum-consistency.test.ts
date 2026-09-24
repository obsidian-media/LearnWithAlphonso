import { describe, expect, it } from "vitest";
import { curriculum } from "./curriculum";
import { curriculumFr } from "./curriculum-fr";
import { curriculumEs } from "./curriculum-es";
import { VOCAB_IMAGES } from "./vocab-images";
import type { Lesson, Question, Unit } from "./curriculum";

/**
 * Automated content-consistency scan across all 3 course content banks
 * (English/French/Spanish, ~510/500/508 lessons respectively as of
 * 2026-09-22). Scoped deliberately: this catches mechanical/structural
 * bugs (broken answer references, duplicate ids, orphaned image keys,
 * empty fields) that are wrong regardless of language -- it does NOT
 * judge grammar correctness, idiom naturalness, or translation quality.
 * A real native-speaker review pass (flagged open in docs/BACKLOG.md
 * for French and Spanish) is a different, human task this doesn't
 * replace. See docs/BACKLOG.md "Harden the 3 existing courses" for the
 * full context this was written under.
 */

type CourseFixture = { name: string; units: Unit[] };

const courses: CourseFixture[] = [
  { name: "en", units: curriculum },
  { name: "fr", units: curriculumFr },
  { name: "es", units: curriculumEs },
];

function allLessons(units: Unit[]): { unit: Unit; lesson: Lesson }[] {
  return units.flatMap((unit) => unit.lessons.map((lesson) => ({ unit, lesson })));
}

function allQuestions(units: Unit[]): { unit: Unit; lesson: Lesson; question: Question }[] {
  return allLessons(units).flatMap(({ unit, lesson }) =>
    lesson.questions.map((question) => ({ unit, lesson, question })),
  );
}

describe.each(courses)("curriculum consistency ($name)", ({ name, units }) => {
  it("has no duplicate unit ids", () => {
    const ids = units.map((u) => u.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `duplicate unit ids in ${name}: ${dupes.join(", ")}`).toEqual([]);
  });

  it("has no duplicate lesson ids", () => {
    const ids = allLessons(units).map(({ lesson }) => lesson.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `duplicate lesson ids in ${name}: ${dupes.join(", ")}`).toEqual([]);
  });

  it("has no duplicate question ids within a single lesson", () => {
    const offenders: string[] = [];
    for (const { lesson } of allLessons(units)) {
      const ids = lesson.questions.map((q) => q.id);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      if (dupes.length > 0) offenders.push(`${lesson.id}: ${dupes.join(", ")}`);
    }
    expect(offenders, `duplicate question ids: ${offenders.join(" | ")}`).toEqual([]);
  });

  it("every lesson has at least one question", () => {
    const empty = allLessons(units)
      .filter(({ lesson }) => lesson.questions.length === 0)
      .map(({ lesson }) => lesson.id);
    expect(empty, `lessons with zero questions in ${name}: ${empty.join(", ")}`).toEqual([]);
  });

  it("translate questions: at least two non-empty acceptable phrasings, no duplicates", () => {
    // One phrasing makes the AI fallback carry the whole question, and an
    // empty list makes matchesAcceptableAnswer reject everything -- a question
    // nobody can answer, which is worse than a wrong one because it is silent.
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      if (question.type !== "translate") continue;
      const key = `${lesson.id}:${question.id}`;
      const answers = question.acceptableAnswers;
      if (answers.length < 2) {
        offenders.push(`${key}: only ${answers.length} acceptable phrasing(s)`);
        continue;
      }
      if (answers.some((a) => a.trim().length === 0)) {
        offenders.push(`${key}: has a blank acceptable phrasing`);
        continue;
      }
      const normalized = answers.map((a) => a.trim().toLowerCase());
      if (new Set(normalized).size !== normalized.length) {
        offenders.push(`${key}: duplicate acceptable phrasings`);
      }
    }
    expect(offenders, `translate problems in ${name}: ${offenders.join(" | ")}`).toEqual([]);
  });

  it("mc questions: answer index is within range of choices, and choices have no duplicates", () => {
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      if (question.type !== "mc") continue;
      const key = `${lesson.id}:${question.id}`;
      if (question.answer < 0 || question.answer >= question.choices.length) {
        offenders.push(
          `${key}: answer index ${question.answer} out of range for ${question.choices.length} choices`,
        );
        continue;
      }
      const normalized = question.choices.map((c) => c.trim().toLowerCase());
      const dupes = normalized.filter((c, i) => normalized.indexOf(c) !== i);
      if (dupes.length > 0) {
        offenders.push(`${key}: duplicate choice text (${[...new Set(dupes)].join(", ")})`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("mc questions: no empty prompt, choice, or explanation strings", () => {
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      if (question.type !== "mc") continue;
      const key = `${lesson.id}:${question.id}`;
      if (!question.prompt.trim()) offenders.push(`${key}: empty prompt`);
      if (!question.explanation.trim()) offenders.push(`${key}: empty explanation`);
      question.choices.forEach((c, i) => {
        if (!c.trim()) offenders.push(`${key}: empty choice at index ${i}`);
      });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("mc questions: imageKey (when present) resolves to a real VOCAB_IMAGES entry", () => {
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      if (question.type !== "mc" || !question.imageKey) continue;
      if (!(question.imageKey in VOCAB_IMAGES)) {
        offenders.push(
          `${lesson.id}:${question.id}: imageKey "${question.imageKey}" not in VOCAB_IMAGES`,
        );
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("fill questions: the correct answer is actually offered in the word bank", () => {
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      if (question.type !== "fill") continue;
      const inBank = question.bank.some(
        (b) => b.trim().toLowerCase() === question.answer.trim().toLowerCase(),
      );
      if (!inBank) {
        offenders.push(
          `${lesson.id}:${question.id}: answer "${question.answer}" not present in bank [${question.bank.join(", ")}]`,
        );
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("listening questions: have spoken audio, and the answer is among the choices", () => {
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      if (question.type !== "listening") continue;
      if (!question.audioText.trim()) {
        offenders.push(`${lesson.id}:${question.id}: empty audioText -- unanswerable`);
      }
      if (!question.choices.includes(question.answer)) {
        offenders.push(
          `${lesson.id}:${question.id}: answer "${question.answer}" not present in choices [${question.choices.join(", ")}]`,
        );
      }
      const lowered = question.choices.map((c) => c.trim().toLowerCase());
      if (new Set(lowered).size !== question.choices.length) {
        offenders.push(`${lesson.id}:${question.id}: duplicate choices`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("fill questions: prompt contains a blank, and bank has no duplicate/empty entries", () => {
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      if (question.type !== "fill") continue;
      const key = `${lesson.id}:${question.id}`;
      if (!question.prompt.includes("___")) offenders.push(`${key}: prompt has no ___ blank`);
      const normalized = question.bank.map((b) => b.trim().toLowerCase());
      if (normalized.some((b) => b === "")) offenders.push(`${key}: empty bank entry`);
      const dupes = normalized.filter((b, i) => normalized.indexOf(b) !== i);
      if (dupes.length > 0)
        offenders.push(`${key}: duplicate bank entries (${[...new Set(dupes)].join(", ")})`);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("reorder questions: answer is reconstructable from the exact token multiset", () => {
    const offenders: string[] = [];
    for (const { lesson, question } of allQuestions(units)) {
      if (question.type !== "reorder") continue;
      const key = `${lesson.id}:${question.id}`;
      const answerWords = question.answer.split(" ").filter(Boolean);
      const tokenMultiset = [...question.tokens].sort();
      const answerMultiset = [...answerWords].sort();
      if (JSON.stringify(tokenMultiset) !== JSON.stringify(answerMultiset)) {
        offenders.push(
          `${key}: answer words [${answerMultiset.join(", ")}] don't match token pool [${tokenMultiset.join(", ")}]`,
        );
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("question ids match the ^[a-z0-9]+$ pattern the server-side item-key validators require", () => {
    // recordMisses/gradeReview (review.functions.ts) regex-validate item
    // keys as `${lessonId}:${questionId}` against /^[a-z0-9]+:[a-z0-9]+$/.
    // A content-authored id outside that pattern would make the question
    // permanently unreviewable (silently rejected server-side, not a
    // visible crash) -- worth catching here rather than live.
    const offenders: string[] = [];
    const idPattern = /^[a-z0-9]+$/;
    for (const { lesson } of allLessons(units)) {
      if (!idPattern.test(lesson.id)) offenders.push(`lesson id "${lesson.id}" fails pattern`);
      for (const question of lesson.questions) {
        if (!idPattern.test(question.id)) {
          offenders.push(`${lesson.id}:${question.id}: question id fails pattern`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
