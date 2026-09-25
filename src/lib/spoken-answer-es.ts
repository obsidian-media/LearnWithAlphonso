/**
 * Comparing a Spanish speech-to-text transcript against the phrase a
 * learner was asked to say.
 *
 * A sibling of spoken-answer.ts and spoken-answer-fr.ts, not an extension
 * of either. Spanish has neither English's auxiliary-verb contractions nor
 * French's elision -- Spanish orthography is close to phonemic, and this
 * module's actual job is narrower than either sibling's: fold accents
 * (shared with both), drop the always-silent letter h (a rule neither
 * sibling needs, since English's h is not silent and French's is
 * inconsistently so), and map single-word numbers. Every call site already
 * knows its course, so selecting by course at the call site keeps all
 * three languages' rule lists intact and legible on their own -- see
 * spoken-answer-fr.ts's header for the fuller version of this argument.
 *
 * UNVERIFIED AGAINST REAL PRODUCTION TRANSCRIPTS, same as spoken-answer-
 * fr.ts was at the equivalent point: no Spanish speak content existed
 * before this module to build a corpus from. Every rule below is inferred
 * from Spanish orthography (h is silent in 100% of cases except inside the
 * digraph "ch", which is not in dispute) and from Deepgram's documented
 * smart_format behaviour (numerals, confirmed for English by
 * spoken-answer.ts; assumed to apply the same way for Spanish, not
 * verified). Treat every rule below as a hypothesis to confirm against
 * real transcripts once Spanish speak content is live, not as settled fact.
 *
 * What this module deliberately does NOT attempt, per
 * docs/superpowers/specs/2026-09-25-spanish-content-audit-design.md §6.1:
 * seseo/ceceo (casa/caza), the b/v merger (tubo/tuvo), and yeísmo
 * (pollo/poyo) are genuine PHONEMIC mergers for most Spanish speakers --
 * two different words that are pronounced identically. No normalisation
 * rule can recover which one a learner meant from audio alone; the STT
 * output for a correct utterance of either word is indistinguishable. That
 * is a content-authoring constraint (avoid relying on these distinctions in
 * `speak` content), not a bug this module could fix by mapping one
 * spelling to the other -- an unconditional casa->caza mapping would
 * silently accept a genuinely wrong answer as often as it rescues a
 * genuinely right one.
 */

/**
 * Spanish "h" is silent in every position except inside the digraph "ch"
 * (its own consonant sound, /tʃ/) -- unlike English's h (usually
 * pronounced) or French's h (inconsistently so), this is a categorical
 * rule with no exceptions to hedge against, so "hola" and "ola" are
 * genuinely the same spoken word and this collapses them without risk of
 * corrupting a real distinction the way a similarly blunt rule would for
 * English or French. Runs BEFORE the generic punctuation strip so it only
 * ever touches the letter h, never anything already-punctuation.
 */
function stripSilentH(input: string): string {
  return input.replace(/h/g, (match, offset: number, s: string) =>
    s[offset - 1]?.toLowerCase() === "c" ? match : "",
  );
}

/** Hesitation noise Deepgram may transcribe as real text. Deliberately just
 * "eh" -- Spanish has other candidates ("este", "o sea", "bueno") but each
 * is also a real word in common use ("este" = "this", "bueno" = "good" or
 * "well", "o sea" = "that is"/"I mean"), so stripping them risks
 * corrupting a genuine answer the same way English's filler list avoids
 * "well"/"like" for the same reason. */
const FILLER = /\b(?:eh)\b/g;

/**
 * Single-word Spanish numbers only. Unlike French (whose dix-sept/dix-
 * huit/dix-neuf are two-word compounds where English's seventeen/eighteen/
 * nineteen are one), Spanish's compound boundary sits later: every number
 * 0-29 is a single word (dieciséis, veintidós, etc. -- the "veinti-"
 * series does not split the way French's soixante-dix does), and the
 * round tens/hundred/thousand (treinta, cuarenta, ..., noventa, cien,
 * mil) are single words too. True compounds start at 31 ("treinta y
 * uno"), which this deliberately excludes, mirroring spoken-answer.ts's
 * and spoken-answer-fr.ts's own compound-number cutoffs.
 *
 * Written unaccented (dieciseis, veintidos, veintitres, veintiseis) even
 * though the correct spelling carries a written accent -- normaliseSpokenEs
 * folds accents BEFORE this list runs, so by the time these patterns are
 * tested against `s`, "dieciséis" has already become "dieciseis". A pattern
 * spelled with the accent would silently never match; this is the same trap
 * as writing punctuation into a pattern that runs after punctuation has
 * already been stripped.
 *
 * `un`/`una` ("one") are deliberately OMITTED, the same bare-word hazard
 * spoken-answer-fr.ts's own NUMBER_WORDS comment names by name: `un`/`una`
 * is also the indefinite article ("a"/"an") in the overwhelming majority
 * of its occurrences, and mapping it unconditionally would turn "un gato"
 * (a cat) into "1 gato", corrupting an answer that was never about
 * counting. Speak content for Spanish should avoid needing the number one
 * spoken, the same way French's own speak content does.
 */
const NUMBER_WORDS: [RegExp, string][] = [
  [/\bcero\b/g, "0"],
  [/\bdos\b/g, "2"],
  [/\btres\b/g, "3"],
  [/\bcuatro\b/g, "4"],
  [/\bcinco\b/g, "5"],
  [/\bseis\b/g, "6"],
  [/\bsiete\b/g, "7"],
  [/\bocho\b/g, "8"],
  [/\bnueve\b/g, "9"],
  [/\bdiez\b/g, "10"],
  [/\bonce\b/g, "11"],
  [/\bdoce\b/g, "12"],
  [/\btrece\b/g, "13"],
  [/\bcatorce\b/g, "14"],
  [/\bquince\b/g, "15"],
  [/\bdieciseis\b/g, "16"],
  [/\bdiecisiete\b/g, "17"],
  [/\bdieciocho\b/g, "18"],
  [/\bdiecinueve\b/g, "19"],
  [/\bveinte\b/g, "20"],
  [/\bveintiuno\b/g, "21"],
  [/\bveintidos\b/g, "22"],
  [/\bveintitres\b/g, "23"],
  [/\bveinticuatro\b/g, "24"],
  [/\bveinticinco\b/g, "25"],
  [/\bveintiseis\b/g, "26"],
  [/\bveintisiete\b/g, "27"],
  [/\bveintiocho\b/g, "28"],
  [/\bveintinueve\b/g, "29"],
  [/\btreinta\b/g, "30"],
  [/\bcuarenta\b/g, "40"],
  [/\bcincuenta\b/g, "50"],
  [/\bsesenta\b/g, "60"],
  [/\bsetenta\b/g, "70"],
  [/\bochenta\b/g, "80"],
  [/\bnoventa\b/g, "90"],
  [/\bcien\b/g, "100"],
  [/\bmil\b/g, "1000"],
];

export function normaliseSpokenEs(input: string): string {
  // Fold accents first, same as spoken-answer.ts/spoken-answer-fr.ts and
  // for the same reason: the punctuation strip below deletes anything
  // outside [a-z0-9\s], so without this "está" becomes "st" rather than
  // matching "esta". Spanish written accents ARE semantic (si/sí, tu/tú,
  // el/él) more often than French's are, which is why this fold is right
  // here (a spoken transcript) and would be wrong for the written
  // `translate` type -- see this module's header and spec §6.1.
  let s = input.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Filler before the silent-h strip, not after: "eh" IS an h-word, so
  // stripping the h first would turn it into "e" and the filler regex would
  // never see the whole word "eh" to match against.
  s = s.replace(FILLER, " ");
  s = stripSilentH(s);
  for (const [pattern, replacement] of NUMBER_WORDS) s = s.replace(pattern, replacement);
  s = s.replace(/[^a-z0-9\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Whether `transcript` is the learner saying `expected`, in Spanish.
 *
 * An empty transcript is false — but it means "nothing was captured", not
 * "said it wrong", matching spoken-answer.ts's matchesSpokenAnswer exactly.
 */
export function matchesSpokenAnswerEs(transcript: string, expected: string): boolean {
  const said = normaliseSpokenEs(transcript);
  if (!said) return false;
  return said === normaliseSpokenEs(expected);
}
