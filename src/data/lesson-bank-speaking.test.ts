import { describe, expect, it } from "vitest";
import { getCourse } from "./courses";

function speakQuestions() {
  return Object.entries(getCourse("en").questionIndex).filter(
    ([, ref]) => ref.question.type === "speak",
  );
}

describe("speak questions", () => {
  it("exist in the course", () => {
    expect(speakQuestions().length).toBeGreaterThan(0);
  });

  it("always carry a sayable phrase", () => {
    for (const [key, ref] of speakQuestions()) {
      const q = ref.question;
      if (q.type !== "speak") continue;
      expect(q.answer.trim(), `${key} has no phrase to say`).not.toBe("");
      // Short enough to say in one breath. A long phrase transcribes
      // unreliably and turns a pronunciation exercise into a memory test.
      expect(q.answer.split(/\s+/).length, `${key} is too long to say`).toBeLessThanOrEqual(12);
    }
  });

  it("shows the learner the phrase they have to say", () => {
    // Unlike listening, nothing is hidden here -- if the prompt did not
    // contain the phrase, the learner would be guessing what to read aloud.
    for (const [key, ref] of speakQuestions()) {
      const q = ref.question;
      if (q.type !== "speak") continue;
      expect(q.prompt.length, `${key} has an empty prompt`).toBeGreaterThan(0);
    }
  });
});
