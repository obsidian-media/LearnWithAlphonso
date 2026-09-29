/**
 * Server-side re-derivation of one lesson-completion answer's correctness --
 * §0.1-d #6's fix. `complete-lesson` used to trust a client-claimed
 * `missedQuestionIds` list with no check that any answer was ever actually
 * graded; a forged client could report zero misses regardless of what it
 * submitted. This grades each answer against the real question, the same
 * derive-don't-trust pattern deriveAnswerCorrectness (srs.ts) already uses
 * for review items.
 *
 * Mirrors src/routes/api/grade-translation.ts's local-first, AI-fallback
 * translate grading (never trusts NVIDIA over the curated list, never
 * rejects an answer because the vendor is unavailable), but as a plain
 * function rather than an HTTP handler.
 *
 * 2026-09-30 audit (Codex/Fable, confirmed): this previously had NO quota
 * gate at all on the AI call, unlike every other AI-cost path in the app
 * (grade-translation.ts, review grading, the Deno complete-lesson
 * function). The doc comment's own claim -- "replay-farming an already-
 * completed lesson is already capped by computeLessonReplayXp" -- is true
 * for XP, but computeLessonReplayXp caps the REWARD, not the number of
 * times this function can be called; nothing stopped a user from
 * repeatedly starting a lesson with a translate question and submitting
 * novel wrong answers purely to force unmetered NVIDIA calls, regardless
 * of XP. `checkQuota` mirrors the Deno _shared/answer-correctness.ts
 * `checkQuota?` parameter exactly (same optional-closure shape), called
 * only right before the actual vendor call, so a free curated-list match
 * still costs nothing.
 */
import type { Question } from "../data/curriculum";
import type { Course } from "../data/courses";
import { deriveAnswerCorrectness } from "./srs";
import { matchesAcceptableAnswer } from "./translation-answer";
import { gradeTranslationWithAi } from "./translation-grader.server";
import { resolveNvidiaChatModel } from "./nvidia-chat-model.server";

export async function gradeLessonAnswer(
  question: Question,
  answer: string,
  course: Course,
  checkQuota?: () => Promise<boolean>,
): Promise<boolean> {
  if (question.type !== "translate") {
    return deriveAnswerCorrectness(question, answer, course);
  }
  if (matchesAcceptableAnswer(answer, question.acceptableAnswers)) return true;
  if (!answer.trim()) return false;
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return false;
  if (checkQuota && !(await checkQuota())) return false;
  const verdict = await gradeTranslationWithAi({
    prompt: question.prompt,
    acceptableAnswers: question.acceptableAnswers,
    submission: answer,
    apiKey,
    model: resolveNvidiaChatModel(),
  });
  // `null` is "no usable AI opinion" (vendor down, no key, unparseable
  // reply), never "wrong" -- keep the local verdict, which already failed.
  return verdict?.correct ?? false;
}
