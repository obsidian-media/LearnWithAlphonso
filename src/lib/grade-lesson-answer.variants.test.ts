import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Question } from "../data/curriculum";
import { gradeLessonAnswer } from "./grade-lesson-answer.server";

// The web server's lesson-completion grading with goal-flavoured versions (goal-variants.ts): the client names the goal
// of the version it showed, and an answer is right against the base or that ONE version, never another goal's.

const translate: Question = {
  id: "t1",
  type: "translate",
  prompt: "Say that you take a bus to work.",
  acceptableAnswers: ["I take a bus to work."],
  explanation: "",
  goalVariants: {
    travel: {
      prompt: "Say that you take a taxi to the airport.",
      acceptableAnswers: ["I take a taxi to the airport."],
      explanation: "",
    },
    work: {
      prompt: "Say that you take the train to the office.",
      acceptableAnswers: ["I take the train to the office."],
      explanation: "",
    },
  },
};

const speak: Question = {
  id: "s1",
  type: "speak",
  prompt: "Say this aloud:",
  answer: "She is a doctor",
  explanation: "",
  goalVariants: {
    travel: { prompt: "Say this aloud:", answer: "She is a pilot", explanation: "" },
    work: { prompt: "Say this aloud:", answer: "She is a chef", explanation: "" },
  },
};

describe("gradeLessonAnswer with goal variants", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });
  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  });

  it("accepts the shown version's wording and the base's, and nothing from another goal", async () => {
    const t = (a: string, goal?: string | null) =>
      gradeLessonAnswer(translate, a, "en", undefined, goal);
    expect(await t("I take a taxi to the airport.", "travel")).toBe(true);
    expect(await t("I take a bus to work.", "travel")).toBe(true);
    // "I take the train to the office." passes on the work goal's prompt, not on the travel one.
    expect(await t("I take the train to the office.", "travel")).toBe(false);
    expect(await t("I take the train to the office.", "work")).toBe(true);
  });

  it("with no goal named (an older build) only the base counts", async () => {
    expect(await gradeLessonAnswer(translate, "I take a taxi to the airport.", "en")).toBe(false);
    expect(
      await gradeLessonAnswer(translate, "I take a taxi to the airport.", "en", undefined, null),
    ).toBe(false);
    expect(await gradeLessonAnswer(translate, "I take a bus to work.", "en")).toBe(true);
  });

  it("grades the non-translate types the same way", async () => {
    expect(await gradeLessonAnswer(speak, "she is a pilot", "en", undefined, "travel")).toBe(true);
    expect(await gradeLessonAnswer(speak, "she is a chef", "en", undefined, "travel")).toBe(false);
    expect(await gradeLessonAnswer(speak, "she is a pilot", "en")).toBe(false);
    expect(await gradeLessonAnswer(speak, "she is a doctor", "en", undefined, "work")).toBe(true);
  });
});
