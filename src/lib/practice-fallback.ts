import type { Lesson, Question } from "@/data/curriculum";
import { hash, reshuffleQuestion } from "@/data/bank-engine";
import { normalizePracticeQuestion, type PracticeQuestion } from "./practice-choices";

export const FALLBACK_PRACTICE_SIZE = 3;

function toPractice(q: Question): PracticeQuestion | null {
  switch (q.type) {
    case "mc":
      // An image question ("What is this?") is unanswerable without its picture, which practice does not show.
      if (q.imageKey) return null;
      return normalizePracticeQuestion({ prompt: q.prompt, choices: q.choices, answerIndex: q.answer, explanation: q.explanation });
    case "fill":
      return normalizePracticeQuestion({ prompt: q.prompt, choices: q.bank, answerIndex: q.bank.indexOf(q.answer), explanation: q.explanation });
    default:
      // listening needs audio; speak, translate and reorder are not multiple choice.
      return null;
  }
}

/**
 * When the model call fails or returns nothing, "Generate more practice" still answers, with a deterministic
 * set drawn from this lesson's own curated questions via bank-engine (same seed, same set), reshuffled so it
 * does not look identical to the lesson the learner just finished.
 */
export function buildFallbackPractice(lesson: Lesson, seed: string): PracticeQuestion[] {
  return lesson.questions
    .map((q) => toPractice(reshuffleQuestion(q, `${seed}-${q.id}`)))
    .filter((q): q is PracticeQuestion => q !== null)
    .sort((a, b) => hash(`${seed}-${a.prompt}`) - hash(`${seed}-${b.prompt}`))
    .slice(0, FALLBACK_PRACTICE_SIZE);
}
