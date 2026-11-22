// The one rule for whether a client's lesson attempt is for content the server accepts. Used by the web server
// (completeLessonRemote in sync.functions.ts) and, as a byte-identical copy, by the complete-lesson Edge Function
// (supabase/functions/complete-lesson/lesson-version.ts; src/lib/lesson-version.test.ts fails if the two differ).
// Pure and import-free on purpose: Edge Functions bundle each directory alone, so nothing here may import.

/**
 * The ids the lesson-mix content pass APPENDS to a lesson (src/lib/lesson-mix/extras.ts: listening "lx1", speak "sx1",
 * translate "tx1"). Fixed by convention, never reused for a real question, so the server can tell an appended extra from
 * a real question by id alone, with nothing the client says.
 */
export const EXTRA_QUESTION_ID = /^(?:lx1|sx1|tx1)$/;

export function isExtraQuestionId(id: string): boolean {
  return EXTRA_QUESTION_ID.test(id);
}

export type LessonSubmission<A extends { questionId: string }> =
  { ok: true; answers: A[]; total: number } | { ok: false };

/**
 * Decides whether an attempt matches the lesson the server holds, across a content changeover where questions were
 * appended. Accepts exactly two shapes, both judged against the server's own lesson:
 *   - the FULL version: an answer for every question the server lesson has;
 *   - the BASE version: an answer for every question that is not an appended extra (what a build older than the
 *     extras sends, or any build against a database not yet re-seeded with them).
 * An answer whose id the server lesson does not have, and which is exactly an extra id (the build is newer than the
 * database), is dropped: it is never graded and never counted. Any other unknown id, a duplicate, a missing real
 * question, or a partial set of the server's extras is rejected.
 * The returned `answers` and `total` are the accepted set, so everything downstream (grading, XP, hearts, streak) is
 * proportional to what was really answered and an extra nobody answered adds nothing. The client's own `total` must
 * equal the number of answers it sent.
 */
export function resolveLessonSubmission<A extends { questionId: string }>(
  lesson: { questions: { id: string }[] } | null,
  total: number,
  answers: A[],
): LessonSubmission<A> {
  if (!lesson || total !== answers.length) return { ok: false };
  const serverIds = new Set(lesson.questions.map((q) => q.id));
  const serverExtras = [...serverIds].filter(isExtraQuestionId);
  const seen = new Set<string>();
  const accepted: A[] = [];
  for (const a of answers) {
    if (seen.has(a.questionId)) return { ok: false };
    seen.add(a.questionId);
    if (serverIds.has(a.questionId)) accepted.push(a);
    else if (!isExtraQuestionId(a.questionId)) return { ok: false };
  }
  const baseCount = serverIds.size - serverExtras.length;
  const extrasAnswered = accepted.filter((a) => isExtraQuestionId(a.questionId)).length;
  // Every real question answered, and the server's extras either all answered (full) or none (base).
  if (accepted.length - extrasAnswered !== baseCount) return { ok: false };
  if (extrasAnswered !== 0 && extrasAnswered !== serverExtras.length) return { ok: false };
  if (accepted.length === 0) return { ok: false };
  return { ok: true, answers: accepted, total: accepted.length };
}
