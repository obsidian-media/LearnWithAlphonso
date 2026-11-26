// The correctness rule for a review answer, extracted from index.ts so it can
// be tested: index.ts calls Deno.serve at module scope, so importing it from a
// test would start a server.
//
// This is the server-side re-derivation of what the player already showed the
// learner. The two agreeing is the whole point -- a disagreement means being
// congratulated and having the item lapsed in the same breath, which is
// invisible from either side alone.
import { matchesSpokenAnswer } from "./spoken-answer.ts";
import { matchesSpokenAnswerFr } from "./spoken-answer-fr.ts";
import { matchesSpokenAnswerEs } from "./spoken-answer-es.ts";
import { matchesAcceptableAnswer } from "./translation-answer.ts";
import { gradeTranslationWithAi } from "./translation-grader.ts";
import { resolveLlmApiKey, resolveLlmChatModel } from "./llm-chat.ts";

export type QuestionRow = {
  type: "mc" | "fill" | "reorder" | "listening" | "speak" | "translate";
  prompt: string | null;
  choices: string[] | null;
  /** For "translate" this is the curated list of acceptable phrasings; for
   *  fill/reorder it is the word bank. Same column, different job. */
  bank: string[] | null;
  answer_index: number | null;
  answer_text: string | null;
  /**
   * Goal-flavoured versions of this question (questions.goal_variants, src/lib/goal-variants.ts). Each entry names its
   * goal and holds the version's prompt and only the answer-bearing columns its type uses, in the row's own shape.
   * The client names the goal of the version it showed (`variantGoal`), and an answer is right against the base row
   * or that ONE version, never another goal's.
   */
  goal_variants?: VariantRow[] | null;
};

export type VariantRow = {
  goal?: string;
  prompt?: string | null;
  choices?: string[] | null;
  bank?: string[] | null;
  answer_index?: number | null;
  answer_text?: string | null;
};

/** The version the learner was shown (the variant for `variantGoal` laid over the row), or null for the base. */
function shownRow(
  question: QuestionRow,
  variantGoal: string | null | undefined,
): QuestionRow | null {
  if (!variantGoal) return null;
  const v = (question.goal_variants ?? []).find((x) => x.goal === variantGoal);
  if (!v) return null;
  const next: QuestionRow = { ...question, goal_variants: null };
  if (v.prompt != null) next.prompt = v.prompt;
  if (v.choices !== undefined) next.choices = v.choices;
  if (v.bank !== undefined) next.bank = v.bank;
  if (v.answer_index !== undefined) next.answer_index = v.answer_index;
  if (v.answer_text !== undefined) next.answer_text = v.answer_text;
  return next;
}

export type AiGrading = {
  /** True only when the learner allowed AI processing. Asked lazily, after the curated list rejects. */
  allowed: () => Promise<boolean>;
  checkQuota?: () => Promise<boolean>;
  /** Logs the cost of the AI grading call (ai-cost-log.ts makeTranslateCostLogger). Optional; never throws. */
  recordUsage?: (body: unknown, requestedModel: string) => Promise<void> | void;
};

/**
 * Mirrors deriveAnswerCorrectness (src/lib/srs.ts) against the DB row shape.
 *
 * Async only because of "translate", whose grading may need a network call.
 * Every other type resolves synchronously and never awaits anything.
 */
export async function deriveAnswerCorrectness(
  question: QuestionRow,
  answer: string,
  course: "en" | "fr" | "es" = "en",
  ai?: AiGrading,
  variantGoal?: string | null,
): Promise<boolean> {
  const shown = shownRow(question, variantGoal);
  if (!shown) return deriveOneVersion(question, answer, course, ai);
  // The base and the shown version are tried locally first (no `ai`, so a translate is only matched against its
  // curated list).
  if (await deriveOneVersion(question, answer, course)) return true;
  if (await deriveOneVersion(shown, answer, course)) return true;
  if (question.type !== "translate") return false;
  // Only a translation can still be right: ask the AI grader once about the version on screen, with the base and
  // shown wordings as the acceptable set.
  const bank = [...(question.bank ?? [])];
  for (const w of shown.bank ?? []) if (!bank.includes(w)) bank.push(w);
  return deriveOneVersion({ ...shown, bank }, answer, course, ai);
}

/** One version of a question (the base row, or a variant laid over it) against an answer. */
async function deriveOneVersion(
  question: QuestionRow,
  answer: string,
  course: "en" | "fr" | "es" = "en",
  ai?: AiGrading,
): Promise<boolean> {
  if (question.type === "mc") {
    return (question.choices ?? [])[question.answer_index ?? -1] === answer;
  }
  // A "speak" answer is a speech-to-text transcript, so it is compared with
  // the spoken normaliser rather than a bare trim. This MUST agree with
  // src/lib/spoken-answer.ts (or spoken-answer-fr.ts for course "fr"): the
  // player grades with that same copy and shows the learner a verdict, and
  // this function then re-derives it. If the two disagreed, the learner
  // would see "Still got it" and have the item lapsed anyway.
  // spoken-answer-fr.test.ts here mirrors the source's vectors, and CI's
  // deno-tests job is what catches drift. English's rules are actively
  // wrong for French ('s -> "is" is an auxiliary-verb contraction; French
  // elision is a different, phonological rule) -- see spoken-answer-fr.ts's
  // header for why this is a course-selected sibling, not a language flag.
  if (question.type === "speak") {
    if (course === "fr") return matchesSpokenAnswerFr(answer, question.answer_text ?? "");
    if (course === "es") return matchesSpokenAnswerEs(answer, question.answer_text ?? "");
    return matchesSpokenAnswer(answer, question.answer_text ?? "");
  }
  // A written translation is graded against the whole curated list first, and
  // only what that rejects is put to the AI grader -- the same two-step the
  // player used, which is the point: a phrasing accepted there and re-derived
  // by string comparison here would be shown as "Still got it" and lapsed in
  // the same breath.
  //
  // Correction (2026-09-29 codebase audit): this used to have no quota
  // enforcement at all, on the reasoning that "an item must be DUE to be
  // graded at all -- roughly one call per due item per day." That reasoning
  // was wrong for exactly the case that matters: a WRONG translate answer
  // sets due_on to TODAY (see grade-review/srs.ts's computeReviewOutcome),
  // so the same item stays due immediately and can be resubmitted any
  // number of times in a row, each one a real AI call. `ai.checkQuota` (an
  // injected async predicate, since this module has no Supabase client of
  // its own) closes that gap -- both callers build it from consume_ai_quota
  // /consume_ai_rate_limit RPCs against the same DB-backed counters
  // src/lib/ai-quota.server.ts uses on the web side. Omitting `ai` entirely
  // disables AI grading.
  if (question.type === "translate") {
    const acceptable = question.bank ?? [];
    if (matchesAcceptableAnswer(answer, acceptable)) return true;
    // An empty or whitespace answer is not worth a vendor call: it cannot be
    // right, and paying to be told so is pure waste.
    if (!answer.trim()) return false;
    // No consent, no vendor call. Omitting `ai` means no AI at all (the safe default for a new caller).
    // Consent is asked before quota, so a refusal spends nothing.
    if (!ai || !(await ai.allowed())) return false;
    const apiKey = resolveLlmApiKey();
    if (!apiKey) return false;
    if (ai.checkQuota && !(await ai.checkQuota())) return false;
    const verdict = await gradeTranslationWithAi({
      prompt: question.prompt ?? "",
      acceptableAnswers: acceptable,
      submission: answer,
      apiKey,
      // The model list (and its fallbacks) lives in llm-chat.ts, the edge chokepoint, not here.
      model: resolveLlmChatModel(),
      onUsage: ai.recordUsage,
      course,
    });
    // `null` is "no usable AI opinion", not "wrong" -- keep the local verdict.
    return verdict?.correct ?? false;
  }
  return normaliseFillAnswer(answer) === normaliseFillAnswer(question.answer_text ?? "");
}

// FILL-ANSWER-NORMALISER:BEGIN (kept identical in src/lib/srs.ts and supabase/functions/_shared/answer-correctness.ts;
// fill-answer-parity.test.ts fails when they differ)
/**
 * A typed or tapped fill-in answer, reduced to what a learner means: iOS and many keyboards type a curly apostrophe
 * (’) where the answer key has a straight one ('), and French answers like "l’ami" or "aujourd’hui" were marked
 * wrong for it. Apostrophe look-alikes become ', any run of spaces (including the no-break spaces French typing
 * inserts) becomes one, spaces hugging an apostrophe go, and case is ignored.
 */
export function normaliseFillAnswer(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\u2018\u2019\u201A\u201B\u02BC\u02B9\u2032\u00B4\u0060\uFF07]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/ ?' ?/g, "'")
    .trim()
    .toLowerCase();
}
// FILL-ANSWER-NORMALISER:END
