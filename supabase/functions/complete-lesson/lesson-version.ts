import { validateLessonAnswerCoverage } from "./progress-math.ts";

/**
 * True when the client's attempt is for the same lesson content the server holds: the lesson exists in this
 * course, `total` equals its question count, and the answers cover exactly its question ids.
 * False is reported as 409 lesson-version-mismatch: the bundled lesson in the binary differs from the seeded
 * one, which no retry can fix, so clients never queue it.
 */
export function lessonPayloadMatches(
  lesson: { questions: { id: string }[] } | null,
  total: number,
  answers: { questionId: string }[],
): boolean {
  if (!lesson || total !== lesson.questions.length) return false;
  try {
    validateLessonAnswerCoverage(lesson, answers);
    return true;
  } catch {
    return false;
  }
}
