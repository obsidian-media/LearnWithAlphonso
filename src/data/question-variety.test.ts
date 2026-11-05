import { describe, expect, it } from "vitest";
import { curriculum, rawCurriculum } from "./curriculum";
import { applyQuestionFixes } from "./question-fixes";
import { TRANSLATE_IDEAS } from "./question-variety-translate";
import { varietyIds } from "./question-variety";

const fixed = applyQuestionFixes(rawCurriculum);
const lessonsOf = (units: typeof curriculum) =>
  units
    .filter((u) => u.level === "A1" || u.level === "A2")
    .flatMap((u) => u.lessons.map((lesson) => ({ unit: u, lesson })));

describe("mixed question formats for A1/A2", () => {
  it("appends after the existing questions and never changes them", () => {
    const before = new Map(lessonsOf(fixed).map(({ lesson }) => [lesson.id, lesson.questions]));
    for (const { lesson } of lessonsOf(curriculum)) {
      const old = before.get(lesson.id)!;
      expect(lesson.questions.slice(0, old.length), lesson.id).toEqual(old);
    }
  });

  it("gives every lesson with a source sentence a reorder, a listening and a translate question", () => {
    const missing: string[] = [];
    for (const { lesson } of lessonsOf(curriculum)) {
      if (!varietyIds(lesson)) continue;
      // Listening, speaking and translate packs are already one format throughout.
      if (lesson.questions.every((q) => ["listening", "speak", "translate"].includes(q.type)))
        continue;
      for (const type of ["reorder", "listening", "translate"] as const)
        if (!lesson.questions.some((q) => q.type === type)) missing.push(`${lesson.id}:${type}`);
    }
    expect(missing).toEqual([]);
  });

  it("uses new, unique ids that continue after the pack", () => {
    for (const { lesson } of lessonsOf(curriculum)) {
      const ids = lesson.questions.map((q) => q.id);
      expect(new Set(ids).size, lesson.id).toBe(ids.length);
    }
    const pack = lessonsOf(curriculum).find(({ lesson }) => lesson.id === "a1p10l1")!.lesson;
    expect(pack.questions.slice(-3).map((q) => q.id)).toEqual(["a1p10q25", "a1p10q26", "a1p10q27"]);
  });

  it("reorder: a 3-8 word sentence, shuffled out of order, tokens match the answer", () => {
    for (const { lesson } of lessonsOf(curriculum)) {
      for (const q of lesson.questions) {
        if (q.type !== "reorder" || !/^(a[12]p\d+q(2[5-9]|3\d)|q\d+)$/.test(q.id)) continue;
        const words = q.answer.split(" ");
        if (!/^(a[12]p\d+q(2[5-9]|3\d))$/.test(q.id)) continue;
        expect(words.length, `${lesson.id}:${q.id}`).toBeGreaterThanOrEqual(3);
        expect(words.length, `${lesson.id}:${q.id}`).toBeLessThanOrEqual(8);
        expect([...q.tokens].sort(), `${lesson.id}:${q.id}`).toEqual([...words].sort());
        expect(q.tokens.join(" "), `${lesson.id}:${q.id}`).not.toBe(q.answer);
      }
    }
  });

  it("listening: four different sentences, the audio is not in the prompt", () => {
    for (const { lesson } of lessonsOf(curriculum)) {
      for (const q of lesson.questions) {
        if (q.type !== "listening" || !/^(a[12]p\d+q(2[5-9]|3\d))$/.test(q.id)) continue;
        expect(new Set(q.choices).size, `${lesson.id}:${q.id}`).toBe(4);
        expect(q.choices).toContain(q.answer);
        expect(q.answer).toBe(q.audioText);
        expect(q.prompt.toLowerCase()).not.toContain(q.audioText.toLowerCase());
      }
    }
  });

  it("translate: an idea, not the sentence, with three or more wordings", () => {
    for (const [id, t] of Object.entries(TRANSLATE_IDEAS)) {
      expect(t.say.length, id).toBeGreaterThanOrEqual(3);
      expect(
        t.say.map((s) => s.toLowerCase()),
        id,
      ).not.toContain(t.idea.toLowerCase());
    }
  });
});
