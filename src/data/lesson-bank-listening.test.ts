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

  it("offers a genuinely confusable distractor, not four unrelated sentences", () => {
    // The point of a listening question is discriminating what was said. If
    // every wrong answer is on a different topic, catching one content word
    // decides it and nothing is being tested -- which is what this content
    // measured as when first written: 0 of 125 questions had a distractor
    // sharing even half the answer's content words.
    const FUNCTION_WORDS = new Set([
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "to",
      "of",
      "and",
      "or",
      "in",
      "on",
      "at",
      "it",
      "its",
      "this",
      "that",
      "with",
      "has",
      "have",
      "had",
      "for",
      "i",
      "we",
      "they",
      "he",
      "she",
      "my",
      "his",
      "her",
      "their",
    ]);
    const content = (s: string) =>
      s
        .toLowerCase()
        .replace(/[^a-z\s'-]/g, " ")
        .split(/\s+/)
        .filter((w) => w && !FUNCTION_WORDS.has(w));

    const questions = listeningQuestions();
    let confusable = 0;
    for (const [, ref] of questions) {
      const q = ref.question;
      if (q.type !== "listening") continue;
      const target = content(q.answer);
      const best = Math.max(
        0,
        ...q.choices
          .filter((c) => c !== q.answer)
          .map((c) => {
            const words = content(c);
            return target.filter((w) => words.includes(w)).length / Math.max(1, target.length);
          }),
      );
      if (best >= 0.5) confusable++;
    }
    expect(questions.length).toBeGreaterThan(100);
    expect(confusable / questions.length).toBeGreaterThan(0.75);
  });

  it("never shows doubled terminal punctuation in the explanation", () => {
    // The audio sentence carries its own full stop, so quoting it and then
    // adding one produced `The audio says "... rise.". Longer statements...`
    // on all 125 questions before this was caught.
    for (const [key, ref] of listeningQuestions()) {
      const q = ref.question;
      if (q.type !== "listening") continue;
      expect(q.explanation, `${key} has doubled punctuation`).not.toMatch(/[.?!]["']?\s*\./);
    }
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
