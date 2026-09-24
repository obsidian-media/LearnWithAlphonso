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
