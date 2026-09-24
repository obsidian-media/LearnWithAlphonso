import { normaliseSpoken } from "./spoken-answer";

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
  return normaliseSpoken(input);
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
