import { describe, expect, it } from "vitest";
import { isPlacementAnswerCorrect } from "./placement-grading";
import type { PlacementQuestion } from "./placement";

const MC: PlacementQuestion = {
  id: "p1",
  level: "A1",
  type: "mc",
  prompt: "She ___ a teacher.",
  choices: ["are", "is", "be", "am"],
  answer: 1,
};

const LISTENING: PlacementQuestion = {
  id: "p50",
  level: "A1",
  type: "listening",
  prompt: "What did you hear?",
  audioText: "She's a doctor.",
  choices: ["She's a doctor.", "He's a driver."],
  answer: "She's a doctor.",
};

const TRANSLATE: PlacementQuestion = {
  id: "p60",
  level: "A1",
  type: "translate",
  prompt: "Say you do not understand.",
  acceptableAnswers: ["I do not understand.", "I don't understand.", "Sorry, I don't follow."],
};

describe("isPlacementAnswerCorrect", () => {
  it("grades mc by the chosen option's text", () => {
    // The exam used to compare an option INDEX, which only mc can express.
    expect(isPlacementAnswerCorrect(MC, "is")).toBe(true);
    expect(isPlacementAnswerCorrect(MC, "are")).toBe(false);
  });

  it("grades listening against the answer text, like the lesson player", () => {
    expect(isPlacementAnswerCorrect(LISTENING, "She's a doctor.")).toBe(true);
    expect(isPlacementAnswerCorrect(LISTENING, "He's a driver.")).toBe(false);
  });

  it("grades translate against every curated wording, tolerantly", () => {
    expect(isPlacementAnswerCorrect(TRANSLATE, "I don't understand")).toBe(true);
    expect(isPlacementAnswerCorrect(TRANSLATE, "I do not understand.")).toBe(true);
    // Same normaliser as everywhere else: a contraction is not a different
    // answer.
    expect(isPlacementAnswerCorrect(TRANSLATE, "i dont understand")).toBe(true);
    expect(isPlacementAnswerCorrect(TRANSLATE, "I understand")).toBe(false);
  });

  it("treats no answer as wrong rather than throwing", () => {
    expect(isPlacementAnswerCorrect(MC, null)).toBe(false);
    expect(isPlacementAnswerCorrect(LISTENING, "")).toBe(false);
    expect(isPlacementAnswerCorrect(TRANSLATE, "   ")).toBe(false);
  });
});
