import { describe, expect, it } from "vitest";
import { getCourse } from "./courses";
import type { Unit } from "./curriculum";
import { applyQuestionFixes, QUESTION_FIXES, type QuestionFix } from "./question-fixes";

const units: Unit[] = [
  {
    id: "u",
    title: "U",
    level: "A1",
    lessons: [
      {
        id: "l1",
        title: "L",
        subtitle: "",
        questions: [
          {
            id: "q1",
            type: "mc",
            prompt: "She ___ a car.",
            choices: ["gets", "has", "is", "are"],
            answer: 1,
            explanation: "e",
          },
          {
            id: "q2",
            type: "fill",
            prompt: "I ___ tea.",
            bank: ["drank", "drink", "drinks", "is"],
            answer: "drink",
            explanation: "e",
          },
        ],
      },
    ],
  } as unknown as Unit,
];

describe("applyQuestionFixes", () => {
  it("replaces the wrong options in order, keeps the answer text and its index", () => {
    const fixes: Record<string, QuestionFix> = {
      "l1/q1": { wrong: ["have", "is", "having"], why: "w" },
    };
    const q = applyQuestionFixes(units, fixes)[0]!.lessons[0]!.questions[0]!;
    if (q.type !== "mc") throw new Error("type");
    expect(q.choices).toEqual(["have", "has", "is", "having"]);
    expect(q.answer).toBe(1);
  });

  it("replaces a fill bank's wrong words and the prompt", () => {
    const fixes: Record<string, QuestionFix> = {
      "l1/q2": {
        prompt: "These days I ___ tea.",
        wrong: ["drinks", "drinking", "is drink"],
        why: "w",
      },
    };
    const q = applyQuestionFixes(units, fixes)[0]!.lessons[0]!.questions[1]!;
    if (q.type !== "fill") throw new Error("type");
    expect(q.prompt).toBe("These days I ___ tea.");
    expect(q.answer).toBe("drink");
    expect(q.bank).toEqual(["drinks", "drink", "drinking", "is drink"]);
  });

  it("does not mutate its input", () => {
    applyQuestionFixes(units, { "l1/q1": { wrong: ["a", "b", "c"], why: "w" } });
    const q = units[0]!.lessons[0]!.questions[0]!;
    if (q.type !== "mc") throw new Error("type");
    expect(q.choices).toEqual(["gets", "has", "is", "are"]);
  });

  it("refuses a fix that does not match a question, has the wrong count or repeats the answer", () => {
    expect(() => applyQuestionFixes(units, { "l1/q9": { why: "w" } })).toThrow(/no question/);
    expect(() => applyQuestionFixes(units, { "l1/q1": { wrong: ["a", "b"], why: "w" } })).toThrow(
      /3 wrong/,
    );
    expect(() =>
      applyQuestionFixes(units, { "l1/q1": { wrong: ["has", "b", "c"], why: "w" } }),
    ).toThrow(/answer/);
    expect(() =>
      applyQuestionFixes(units, { "l1/q1": { wrong: ["a", "a", "c"], why: "w" } }),
    ).toThrow(/duplicate/);
  });
});

describe("the shipped fixes", () => {
  it("each one is applied to the English course and carries a reason", () => {
    const course = getCourse("en");
    for (const [key, fix] of Object.entries(QUESTION_FIXES)) {
      const [lessonId, qid] = key.split("/");
      const ref = course.questionIndex[`${lessonId}:${qid}`];
      expect(ref, key).toBeTruthy();
      expect(fix.why.length, key).toBeGreaterThan(8);
      const q = ref!.question;
      if (q.type !== "mc" && q.type !== "fill") throw new Error(key);
      if (fix.prompt) expect(q.prompt, key).toBe(fix.prompt);
      if (fix.wrong) {
        const options = q.type === "mc" ? q.choices : q.bank;
        for (const w of fix.wrong) expect(options, key).toContain(w);
      }
    }
  });
});
