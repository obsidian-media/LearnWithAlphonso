import { matchesAcceptableAnswer } from "@/lib/translation-answer";
import type { PlacementQuestion } from "./placement";

/**
 * One grading rule for every placement question type.
 *
 * Takes the submitted TEXT rather than an option index. The exam used to
 * compare `picked === q.answer` with `picked` being a number, which only
 * multiple choice can express -- a listening question answers with the choice's
 * text and a translation with a whole sentence.
 *
 * Translation is graded LOCALLY here, against the curated wordings. That is the
 * floor, exactly as in the lesson player: the AI second opinion runs
 * server-side and the route asks for it separately, and it can only ever
 * upgrade this verdict.
 *
 * No answer is wrong rather than an error. Getting that backwards would throw
 * mid-exam, and an exam that cannot finish leaves the learner unplaced.
 */
export function isPlacementAnswerCorrect(
  question: PlacementQuestion,
  answer: string | null,
): boolean {
  const given = (answer ?? "").trim();
  if (!given) return false;
  if (question.type === "mc") return question.choices[question.answer] === given;
  if (question.type === "listening") return question.answer === given;
  return matchesAcceptableAnswer(given, question.acceptableAnswers);
}
