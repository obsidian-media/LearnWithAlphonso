import type { Question } from "@/data/curriculum";

/**
 * What the answer panel says after Check: a title, and the right answer to show when the learner missed it.
 * The verdict itself is decided by the caller; this only words it. Mirrors the iOS Kit's AnswerVerdict.swift.
 */
export function verdictTitle(correct: boolean): string {
  return correct ? "Correct!" : "Not quite";
}

/** The answer to show under "Not quite". For a translation, one of several accepted wordings. */
export function correctAnswerText(q: Question): string {
  switch (q.type) {
    case "mc":
      return q.choices[q.answer] ?? "";
    case "translate":
      return q.acceptableAnswers[0] ?? "";
    default:
      return q.answer;
  }
}
