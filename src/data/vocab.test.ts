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

  it("fills the blank for a cloze multiple-choice question too", () => {
    const items = deriveVocab(lesson);
    expect(items[0].example).toBe("She is happy.");
  });

  it("never shows the quiz explanation as the meaning", () => {
    // The data carries no gloss for a word, only the explanation of why it was the
    // right answer ("'am' is correct here. Match the verb form to the subject."),
    // which is not what a word means. Nothing is better than that.
    const items = deriveVocab(lesson);
    for (const item of items) {
      expect(item.meaning).toBe("");
      expect(item.meaning).not.toBe("third person singular");
    }
  });

  it("shows no example when the prompt is a quiz stem rather than a sentence", () => {
    const stems = [
      'Plural of "baby": ___',
      'Which verb goes with "homework"? ___',
      'Opposite of "hot":',
      "Choose the correct word:",
    ];
    for (const prompt of stems) {
      const q: Question = {
        id: "s",
        type: "mc",
        prompt,
        choices: ["babies", "x", "y"],
        answer: 0,
        explanation: "e",
      };
      const [item] = deriveVocab({ id: "s", title: "", subtitle: "", questions: [q] });
      expect(item.example, prompt).toBe("");
    }
  });

  it("never leaks quiz text into any derived card in the real English course", () => {
    const course = getCourse("en");
    const bad: string[] = [];
    for (const unit of course.curriculum)
      for (const l of unit.lessons)
        for (const item of deriveVocab(l)) {
          if (item.example.includes("___") || item.example.includes("→"))
            bad.push(`${l.id} ${item.term}: ${item.example}`);
          if (item.meaning !== "") bad.push(`${l.id} ${item.term}: meaning ${item.meaning}`);
        }
    expect(bad).toEqual([]);
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
