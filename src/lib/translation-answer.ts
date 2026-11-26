import { normaliseSpoken } from "./spoken-answer";

/** A letters-only stand-in for "ñ" that survives the spoken normaliser's accent fold and punctuation strip. */
const ENYE = "xqenyeqx";

/**
 * Comparing a learner's written translation against the curated phrasings a
 * question accepts.
 *
 * This is the LOCAL half of translate grading. It costs nothing, works with no
 * network, and is the floor: a miss here is not a verdict, it is the point at
 * which the servers ask an AI grader whether the wording is valid anyway (see
 * `/api/grade-translation`). What this returns `true` for is never overturned.
 *
 * It deliberately delegates normalisation to `normaliseSpoken` rather than
 * growing a second set of rules. A typed translation and a spoken one face the
 * same questions -- is "don't" the same as "do not", is "café" the same as
 * "cafe" -- and two answers to them would mean a phrasing accepted when said
 * and rejected when typed, which the learner would experience as the app
 * changing its mind for no visible reason.
 */
export function normaliseWritten(input: string): string {
  // The spoken normaliser folds every accent, which is right for a transcript (speech recognition cannot hear a tilde)
  // but wrong for typed Spanish: "ano" and "año" are different words. Protect the enye through the fold, then restore
  // it. Speech keeps its tolerance (spoken-answer-es.ts); this is the written side only.
  const protectedInput = input.normalize("NFC").replace(/ñ/gi, ENYE);
  return normaliseSpoken(protectedInput).split(ENYE).join("ñ");
}

/**
 * Whether `submission` is one of the phrasings `acceptable` allows.
 *
 * Fails closed in both empty cases. An empty submission is not an answer, and
 * an empty `acceptable` list -- which only a malformed pack line can produce --
 * matches nothing rather than everything. Over-accepting is the dangerous
 * direction here: it is invisible to the learner and silently guts the
 * question, where under-accepting at worst sends one more answer to the AI
 * grader.
 */
export function matchesAcceptableAnswer(submission: string, acceptable: string[]): boolean {
  const written = normaliseWritten(submission);
  if (!written) return false;
  return acceptable.some((candidate) => normaliseWritten(candidate) === written);
}
