import { describe, expect, it } from "vitest";
import { normalizePracticeQuestion } from "./practice-choices";

const q = (choices: string[], answerIndex: number) => ({
  prompt: "p",
  choices,
  answerIndex,
  explanation: "e",
});

describe("normalizePracticeQuestion", () => {
  it("keeps four distinct choices untouched", () => {
    expect(normalizePracticeQuestion(q(["a", "b", "c", "d"], 2))).toEqual(
      q(["a", "b", "c", "d"], 2),
    );
  });
  it("drops case/space duplicates, keeps first-seen order and remaps the answer", () => {
    expect(normalizePracticeQuestion(q(["Cat", "dog", " cat ", "bird"], 3))).toEqual(
      q(["Cat", "dog", "bird"], 2),
    );
  });
  it("remaps an answer that pointed at a duplicate to the surviving copy", () => {
    expect(normalizePracticeQuestion(q(["a", "b", "A", "c"], 2))).toEqual(q(["a", "b", "c"], 0));
  });
  it("rejects a question with fewer than 3 distinct choices", () => {
    expect(normalizePracticeQuestion(q(["a", "a", "b", "B"], 0))).toBeNull();
  });
  it("rejects an out-of-range answer and blank choices", () => {
    expect(normalizePracticeQuestion(q(["a", "b", "c", "d"], 4))).toBeNull();
    expect(normalizePracticeQuestion(q(["a", "", "c", "d"], 1))).toBeNull();
  });
});
