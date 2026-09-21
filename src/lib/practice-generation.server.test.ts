import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generatePracticeQuestions,
  parsePracticeQuestions,
  practicePrompt,
} from "./practice-generation.server";

const QUESTION = {
  prompt: "She ___ to school every day.",
  choices: ["go", "goes", "went", "gone"],
  answerIndex: 1,
  explanation: "Third-person singular present takes 'goes'.",
};

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify([QUESTION]) } }] }),
      {
        status: 200,
      },
    ),
  );
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("parsePracticeQuestions", () => {
  it("parses a well-formed JSON array", () => {
    expect(parsePracticeQuestions(JSON.stringify([QUESTION]))).toEqual([QUESTION]);
  });

  it("strips markdown code fences before parsing", () => {
    expect(parsePracticeQuestions("```json\n" + JSON.stringify([QUESTION]) + "\n```")).toEqual([
      QUESTION,
    ]);
  });

  it("returns an empty array for invalid JSON", () => {
    expect(parsePracticeQuestions("not json")).toEqual([]);
  });

  it("returns an empty array when the shape doesn't match the schema", () => {
    expect(parsePracticeQuestions(JSON.stringify([{ prompt: "no choices here" }]))).toEqual([]);
  });

  it("caps at 5 questions", () => {
    const many = Array.from({ length: 8 }, () => QUESTION);
    expect(parsePracticeQuestions(JSON.stringify(many))).toEqual([]);
  });
});

describe("practicePrompt", () => {
  it("includes the topic and every sample question's prompt and answer", () => {
    const prompt = practicePrompt("Present tense verbs", [
      { prompt: "He ___ coffee.", answer: "drinks" },
    ]);
    expect(prompt).toContain("Present tense verbs");
    expect(prompt).toContain("He ___ coffee.");
    expect(prompt).toContain("drinks");
  });
});

describe("generatePracticeQuestions", () => {
  function params(overrides: Partial<Parameters<typeof generatePracticeQuestions>[0]> = {}) {
    return {
      topic: "Present tense verbs",
      sampleQuestions: [{ prompt: "He ___ coffee.", answer: "drinks" }],
      nvidiaApiKey: "test-key",
      nvidiaModel: "test-model",
      ...overrides,
    };
  }

  it("returns the parsed questions on success", async () => {
    const result = await generatePracticeQuestions(params());
    expect(result).toEqual([QUESTION]);
  });

  it("returns an empty array without calling NVIDIA when there are no sample questions", async () => {
    const result = await generatePracticeQuestions(params({ sampleQuestions: [] }));
    expect(result).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns an empty array when the upstream call fails", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("error", { status: 500 }));
    const result = await generatePracticeQuestions(params());
    expect(result).toEqual([]);
  });

  it("returns an empty array when fetch itself throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await generatePracticeQuestions(params());
    expect(result).toEqual([]);
  });
});
