// Deno copy of src/lib/translation-answer.ts. Supabase Edge Functions bundle
// each function directory independently, so a relative import reaching outside
// supabase/functions/grade-review/ is not reliably resolvable -- same reasoning
// as srs.ts and spoken-answer.ts here.
//
// KEEP IN SYNC with the source of truth. translation-answer.test.ts mirrors
// that file's vectors and CI's deno-tests job fails on divergence.
import { normaliseSpoken } from "./spoken-answer.ts";

/**
 * The LOCAL half of translate grading: costs nothing, needs no network, and is
 * the floor rather than the verdict. What it accepts is correct; what it
 * rejects goes to the AI grader (translation-grader.ts) before anything is
 * decided.
 *
 * Normalisation is delegated to the spoken normaliser on purpose -- a typed
 * translation and a spoken one face the same questions ("don't" vs "do not",
 * "café" vs "cafe"), and two answers to them would mean a phrasing accepted
 * when said and rejected when typed.
 */
export function normaliseWritten(input: string): string {
  return normaliseSpoken(input);
}

/**
 * Whether `submission` is one of the phrasings `acceptable` allows.
 *
 * Fails closed in both empty cases: an empty submission is not an answer, and
 * an empty `acceptable` list matches nothing rather than everything.
 */
export function matchesAcceptableAnswer(submission: string, acceptable: string[]): boolean {
  const written = normaliseWritten(submission);
  if (!written) return false;
  return acceptable.some((candidate) => normaliseWritten(candidate) === written);
}
