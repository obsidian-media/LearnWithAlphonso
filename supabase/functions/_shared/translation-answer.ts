// Deno copy of src/lib/translation-answer.ts. Supabase Edge Functions bundle
// each function directory independently, so a relative import reaching outside
// supabase/functions/grade-review/ is not reliably resolvable -- same reasoning
// as srs.ts and spoken-answer.ts here.
//
// KEEP IN SYNC with the source of truth. translation-answer.test.ts mirrors
// that file's vectors and CI's deno-tests job fails on divergence.
import { normaliseSpoken } from "./spoken-answer.ts";

/** A letters-only stand-in for "ñ" that survives the spoken normaliser's accent fold and punctuation strip. */
const ENYE = "xqenyeqx";

/**
 * Spanish words whose tilde-less spelling is itself a different real word (año/ano, uña/una, peña/pena, caña/cana,
 * sueño/sueno, cuña/cuna, moño/mono, ceño/ceno, maña/mana, cañón/canon). Kept IN STEP in the Deno, Swift and Kotlin
 * copies; the shared grading-parity cases fail when they drift. (The grader word list is not used: it drops words
 * under five letters and is not available on the native apps.)
 */
const ENYE_TWINS = new Set(["año", "años", "peña", "peñas", "caña", "cañas", "sueño", "sueños", "uña", "uñas", "cuña", "cuñas", "moño", "moños", "ceño", "maña", "cañón"]);

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
 * Fails closed in both empty cases: an empty submission is not an answer, and
 * an empty `acceptable` list matches nothing rather than everything.
 */
export function matchesAcceptableAnswer(submission: string, acceptable: string[]): boolean {
  const written = normaliseWritten(submission);
  if (!written) return false;
  return acceptable.some((candidate) => normaliseWritten(candidate) === written);
}
