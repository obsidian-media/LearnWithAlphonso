import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gradeLessonAnswer } from "./grade-lesson-answer.server";
import type { Question } from "../data/curriculum";

const mc: Question = {
  id: "q1",
  type: "mc",
  prompt: "Which is a formal greeting?",
  choices: ["Hey!", "What's up?", "Good morning.", "Yo."],
  answer: 2,
  explanation: "",
};

const fill: Question = {
  id: "q2",
  type: "fill",
  prompt: "Nice to ___ you.",
  bank: ["meet", "meat", "met", "meeting"],
  answer: "meet",
  explanation: "",
};

const translate: Question = {
  id: "q9",
  type: "translate",
  prompt: "Translate: Good morning",
  acceptableAnswers: ["Buenos días"],
  explanation: "",
};

describe("gradeLessonAnswer", () => {
  const originalKey = process.env.NVIDIA_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    delete process.env.NVIDIA_API_KEY;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.NVIDIA_API_KEY;
    else process.env.NVIDIA_API_KEY = originalKey;
    global.fetch = originalFetch;
  });

  it("grades an mc answer by choice-index equality", async () => {
    expect(await gradeLessonAnswer(mc, "Good morning.", "en")).toBe(true);
    expect(await gradeLessonAnswer(mc, "Hey!", "en")).toBe(false);
  });

  it("grades a fill answer case-insensitively", async () => {
    expect(await gradeLessonAnswer(fill, "Meet", "en")).toBe(true);
    expect(await gradeLessonAnswer(fill, "meat", "en")).toBe(false);
  });

  it("accepts a translate answer that matches the curated list without calling the AI grader", async () => {
    global.fetch = vi.fn() as typeof fetch;
    expect(await gradeLessonAnswer(translate, "Buenos días", "en")).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects a translate miss when no AI key is configured, rather than escalating", async () => {
    global.fetch = vi.fn() as typeof fetch;
    expect(await gradeLessonAnswer(translate, "Buenas noches", "en")).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("escalates a translate miss to the AI grader when a key is configured, and trusts its verdict", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ correct: true, reason: null }) } }],
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    expect(await gradeLessonAnswer(translate, "Buen día", "en")).toBe(true);
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it("never rejects a submission because the AI grader failed -- a vendor outage is not evidence of a wrong answer", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as typeof fetch;

    await expect(gradeLessonAnswer(translate, "Buen día", "en")).resolves.toBe(false);
  });
});
