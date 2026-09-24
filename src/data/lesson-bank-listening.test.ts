import { describe, expect, it } from "vitest";
import { getCourse } from "./courses";

function listeningQuestions() {
  return Object.entries(getCourse("en").questionIndex).filter(
    ([, ref]) => ref.question.type === "listening",
  );
}

describe("listening questions", () => {
  it("exist in the course", () => {
    expect(listeningQuestions().length).toBeGreaterThan(0);
  });

  it("never restates the audio in the prompt", () => {
    // If the on-screen stem contains what is spoken, the learner can answer by
    // reading and the exercise tests nothing. This guards future authoring:
    // the pack shipped today uses a generic stem, and it must stay that way.
    for (const [key, ref] of listeningQuestions()) {
      const q = ref.question;
      if (q.type !== "listening") continue;
      const prompt = q.prompt.toLowerCase();
      const audio = q.audioText.toLowerCase().replace(/[.?!]+$/, "");
      expect(prompt.includes(audio), `${key} restates its audio in the prompt`).toBe(false);
    }
  });

  it("always carry non-empty audio text and a resolvable answer", () => {
    // A listening question without audio is unanswerable, and an answer that
    // is not among its own choices is unpickable.
    for (const [key, ref] of listeningQuestions()) {
      const q = ref.question;
      if (q.type !== "listening") continue;
      expect(q.audioText.trim(), `${key} has empty audioText`).not.toBe("");
      expect(q.choices.length, `${key} has too few choices`).toBeGreaterThanOrEqual(2);
      expect(q.choices, `${key} answer is not among its choices`).toContain(q.answer);
    }
  });
});
