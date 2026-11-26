import { normaliseSpoken } from "./spoken-answer";

/** A letters-only stand-in for "ñ" that survives the spoken normaliser's accent fold and punctuation strip. */
const ENYE = "xqenyeqx";

/**
 * Spanish words whose tilde-less spelling is itself a different real word (año/ano, uña/una, peña/pena, caña/cana,
 * sueño/sueno, cuña/cuna, moño/mono, ceño/ceno, maña/mana, cañón/canon). Kept IN STEP in the Deno, Swift and Kotlin
 * copies; the shared grading-parity cases fail when they drift. (The grader word list is not used: it drops words
 * under five letters and is not available on the native apps.)
 */
const ENYE_TWINS = new Set([
  "año",
  "años",
  "peña",
  "peñas",
  "caña",
  "cañas",
  "sueño",
  "sueños",
  "uña",
  "uñas",
  "cuña",
  "cuñas",
  "moño",
  "moños",
  "ceño",
  "maña",
  "cañón",
]);

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
  // The spoken normaliser folds every accent, so a missing tilde is a forgivable slip ("espanol" for "español": many
  // keyboards have no enye). The one exception: a word whose tilde-less spelling is a DIFFERENT real word ("ano" for
  // "año", "una" for "uña") keeps its enye through the fold, so the two never compare equal. Speech keeps its tolerance
  // (spoken-answer-es.ts); this is the written side only.
  const protectedInput = input
    .normalize("NFC")
    .replace(/\p{L}*[ñÑ]\p{L}*/gu, (word) =>
      ENYE_TWINS.has(word.toLowerCase()) ? word.replace(/ñ/gi, ENYE) : word,
    );
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
