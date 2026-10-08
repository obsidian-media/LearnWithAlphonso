import { describe, expect, it } from "vitest";
import { getCourse } from "@/data/courses";
import { buildFallbackPractice, FALLBACK_PRACTICE_SIZE } from "./practice-fallback";

const lesson = getCourse("en").findLesson("u1l1")!.lesson; // real lesson: mc and fill questions

describe("buildFallbackPractice", () => {
  it("returns up to FALLBACK_PRACTICE_SIZE questions drawn from the lesson's own bank", () => {
    const set = buildFallbackPractice(lesson, lesson.id);
    expect(set.length).toBeGreaterThan(0);
    expect(set.length).toBeLessThanOrEqual(FALLBACK_PRACTICE_SIZE);
    const prompts = new Set(lesson.questions.map((x) => x.prompt));
    for (const s of set) expect(prompts.has(s.prompt)).toBe(true);
  });
  it("is deterministic for a seed", () => {
    expect(buildFallbackPractice(lesson, "s1")).toEqual(buildFallbackPractice(lesson, "s1"));
  });
  it("every question has distinct choices and a correct answer index", () => {
    for (const s of buildFallbackPractice(lesson, lesson.id)) {
      expect(new Set(s.choices.map((c) => c.trim().toLowerCase())).size).toBe(s.choices.length);
      expect(s.choices[s.answerIndex]).toBeDefined();
      const source = lesson.questions.find((x) => x.prompt === s.prompt)!;
      const answer =
        source.type === "mc"
          ? source.choices[source.answer]
          : source.type === "fill"
            ? source.answer
            : null;
      expect(s.choices[s.answerIndex]).toBe(answer);
    }
  });
  it("skips image-dependent and non-choice question types", () => {
    const only = {
      ...lesson,
      questions: [
        {
          id: "x1",
          type: "mc" as const,
          prompt: "What is this?",
          choices: ["a", "b", "c"],
          answer: 0,
          explanation: "e",
          imageKey: "cat",
        },
        { id: "x2", type: "speak" as const, prompt: "Say hi", answer: "hi", explanation: "e" },
      ],
    };
    expect(buildFallbackPractice(only as never, "s")).toEqual([]);
  });
});
