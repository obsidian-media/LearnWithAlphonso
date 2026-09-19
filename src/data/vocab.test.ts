import { describe, expect, it } from "vitest";
import { getCourse } from "./courses";
import { deriveVocab, vocabForLesson } from "./vocab";
import type { Lesson, Question } from "./curriculum";

const mc: Question = {
  id: "q1",
  type: "mc",
  prompt: "She ___ happy.",
  choices: ["is", "am", "are"],
  answer: 0,
  explanation: "third person singular",
};

const fill: Question = {
  id: "q2",
  type: "fill",
  prompt: "I ___ coffee.",
  bank: ["drink", "drinks"],
  answer: "drink",
  explanation: "present simple",
};

const dupeMc: Question = { ...mc, id: "q3", prompt: "Different prompt but same answer:" };

const lesson: Lesson = {
  id: "l1",
  title: "Test lesson",
  subtitle: "",
  questions: [mc, fill, dupeMc],
};

describe("deriveVocab", () => {
  it("builds one vocab item per question, using the correct answer as the term", () => {
    const items = deriveVocab(lesson);
    expect(items.map((i) => i.term)).toEqual(["is", "drink"]);
  });

  it("dedupes terms case-insensitively", () => {
    const items = deriveVocab(lesson);
    expect(items.length).toBe(2);
  });

  it("fills the blank for fill-in questions", () => {
    const items = deriveVocab(lesson);
    expect(items[1].example).toBe("I drink coffee.");
  });

  it("formats mc questions as prompt -> answer", () => {
    const items = deriveVocab(lesson);
    expect(items[0].example).toBe("She ___ happy. → is");
  });

  it("skips questions whose answer is blank", () => {
    const blankLesson: Lesson = {
      id: "l2",
      title: "",
      subtitle: "",
      questions: [{ ...mc, choices: [], answer: 0 }],
    };
    expect(deriveVocab(blankLesson)).toEqual([]);
  });
});

describe("vocabForLesson", () => {
  it("returns vocab for a real lesson in the English course", () => {
    const bundle = getCourse("en");
    const lessonId = bundle.allLessonIds[0];
    const items = vocabForLesson(lessonId, "en");
    expect(items.length).toBeGreaterThan(0);
  });

  it("returns an empty array for an unknown lesson id", () => {
    expect(vocabForLesson("does-not-exist", "en")).toEqual([]);
  });

  it("caches results per course:lesson key", () => {
    const bundle = getCourse("en");
    const lessonId = bundle.allLessonIds[1];
    const first = vocabForLesson(lessonId, "en");
    const second = vocabForLesson(lessonId, "en");
    expect(second).toBe(first);
  });
});
