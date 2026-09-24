// The correctness rule for a review answer, extracted from index.ts so it can
// be tested: index.ts calls Deno.serve at module scope, so importing it from a
// test would start a server.
//
// This is the server-side re-derivation of what the player already showed the
// learner. The two agreeing is the whole point -- a disagreement means being
// congratulated and having the item lapsed in the same breath, which is
// invisible from either side alone.
import { matchesSpokenAnswer } from "./spoken-answer.ts";
import { matchesAcceptableAnswer } from "./translation-answer.ts";
import { gradeTranslationWithAi } from "./translation-grader.ts";

export type QuestionRow = {
  type: "mc" | "fill" | "reorder" | "listening" | "speak" | "translate";
  prompt: string | null;
  choices: string[] | null;
  /** For "translate" this is the curated list of acceptable phrasings; for
   *  fill/reorder it is the word bank. Same column, different job. */
  bank: string[] | null;
  answer_index: number | null;
  answer_text: string | null;
};

/**
 * Mirrors deriveAnswerCorrectness (src/lib/srs.ts) against the DB row shape.
 *
 * Async only because of "translate", whose grading may need a network call.
 * Every other type resolves synchronously and never awaits anything.
 */
export async function deriveAnswerCorrectness(question: QuestionRow, answer: string): Promise<boolean> {
  if (question.type === "mc") {
    return (question.choices ?? [])[question.answer_index ?? -1] === answer;
  }
  // A "speak" answer is a speech-to-text transcript, so it is compared with
  // the spoken normaliser rather than a bare trim. This MUST agree with
  // src/lib/spoken-answer.ts: the player grades with that copy and shows the
  // learner a verdict, and this function then re-derives it. If the two
  // disagreed, the learner would see "Still got it" and have the item lapsed
  // anyway. srs.test.ts here mirrors the source's vectors, and CI's deno-tests
  // job is what catches drift.
  if (question.type === "speak") {
    return matchesSpokenAnswer(answer, question.answer_text ?? "");
  }
  // A written translation is graded against the whole curated list first, and
  // only what that rejects is put to the AI grader -- the same two-step the
  // player used, which is the point: a phrasing accepted there and re-derived
  // by string comparison here would be shown as "Still got it" and lapsed in
  // the same breath.
  //
  // Two operational facts, stated here rather than discovered in production:
  // this function has no consumeQuota (that helper is web-side, backed by
  // Supabase tables), and its structural rate limit is that an item must be
  // DUE to be graded at all -- roughly one call per due item per day. And if
  // NVIDIA_API_KEY is not configured for this function, translate grading
  // quietly degrades to local-only: a correct outcome, just a stricter one.
  if (question.type === "translate") {
    const acceptable = question.bank ?? [];
    if (matchesAcceptableAnswer(answer, acceptable)) return true;
    const apiKey = Deno.env.get("NVIDIA_API_KEY");
    if (!apiKey) return false;
    const verdict = await gradeTranslationWithAi({
      prompt: question.prompt ?? "",
      acceptableAnswers: acceptable,
      submission: answer,
      apiKey,
      model: Deno.env.get("NVIDIA_CHAT_MODEL") ?? "meta/llama-3.1-8b-instruct",
      });
    // `null` is "no usable AI opinion", not "wrong" -- keep the local verdict.
    return verdict?.correct ?? false;
  }
  return answer.trim().toLowerCase() === (question.answer_text ?? "").trim().toLowerCase();
}
