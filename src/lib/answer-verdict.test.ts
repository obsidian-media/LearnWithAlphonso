import { describe, expect, it } from "vitest";
import type { Question } from "@/data/curriculum";
import { correctAnswerText, verdictTitle } from "./answer-verdict";

const base = { id: "q1", prompt: "p", explanation: "e" };

describe("answer verdict", () => {
  it("titles the verdict", () => {
    expect(verdictTitle(true)).toBe("Correct!");
    expect(verdictTitle(false)).toBe("Not quite");
  });

  it("shows the choice text for multiple choice, and nothing for an out-of-range answer", () => {
    expect(
      correctAnswerText({
        ...base,
        type: "mc",
        choices: ["dig up", "ascertain"],
        answer: 1,
      } as Question),
    ).toBe("ascertain");
    expect(correctAnswerText({ ...base, type: "mc", choices: ["a"], answer: 4 } as Question)).toBe(
      "",
    );
  });

  it("shows the answer for fill, reorder, listening and speak", () => {
    expect(
      correctAnswerText({ ...base, type: "fill", bank: [], answer: "water" } as Question),
    ).toBe("water");
    expect(
      correctAnswerText({
        ...base,
        type: "reorder",
        tokens: [],
        answer: "She is here",
      } as Question),
    ).toBe("She is here");
    expect(
      correctAnswerText({
        ...base,
        type: "listening",
        audioText: "x",
        choices: ["x"],
        answer: "x",
      } as Question),
    ).toBe("x");
    expect(correctAnswerText({ ...base, type: "speak", answer: "Bonjour" } as Question)).toBe(
      "Bonjour",
    );
  });

  it("shows the first accepted wording for a translation, or nothing", () => {
    expect(
      correctAnswerText({
        ...base,
        type: "translate",
        acceptableAnswers: ["I am tired", "I'm tired"],
      } as Question),
    ).toBe("I am tired");
    expect(
      correctAnswerText({ ...base, type: "translate", acceptableAnswers: [] } as Question),
    ).toBe("");
  });
});
