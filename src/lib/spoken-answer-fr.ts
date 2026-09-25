/**
 * Comparing a French speech-to-text transcript against the phrase a learner
 * was asked to say.
 *
 * A sibling of spoken-answer.ts, not an extension of it. Two reasons, from
 * spec docs/superpowers/specs/2026-09-24-french-phase-2-question-types-design.md
 * section 4.3: English's rules are actively wrong for French (`'s` -> "is"
 * encodes an English AUXILIARY-VERB contraction -- has/is/would/will being
 * dropped -- and French elision is a PHONOLOGICAL rule about vowel-initial
 * word boundaries with no relationship to that; `NUMBER_WORDS` is English
 * vocabulary, meaningless here), and every call site already knows its
 * course, so selecting by course at the call site keeps both languages'
 * hard-won trap lists intact and legible on their own.
 *
 * UNVERIFIED AGAINST REAL PRODUCTION TRANSCRIPTS. spoken-answer.ts's English
 * rules were built from observed Deepgram output over time (its own comments
 * cite specific packs where a specific rule was found missing). No French
 * speak content has shipped yet, so there is no equivalent corpus -- this is
 * inferred from linguistic precedent (elision is well-documented; STT
 * dropping or space-separating an apostrophe mirrors the exact failure mode
 * English's own APOSTROPHE_LESS list was built to cover) and from Deepgram's
 * documented smart_format behaviour (numerals, confirmed for English by
 * spoken-answer.ts; assumed to apply the same way for French, not verified).
 * Treat every rule below as a hypothesis to confirm against real transcripts
 * once French speak content is live, not as settled fact.
 */

/**
 * French elision: a small closed set of function words drop their final
 * vowel and take an apostrophe before a vowel- or mute-h-initial word --
 * "je aime" is never written; "j'aime" always is. Correct French text (what
 * Deepgram should return when it hears the utterance correctly) already
 * elides with an apostrophe, so the generic apostrophe-strip below (same
 * language-neutral step spoken-answer.ts uses) already reduces "j'aime" and
 * "jaime" to the same string with no rule needed here.
 *
 * The case that DOES need a rule is Deepgram rendering the elision as two
 * SPACE-separated tokens instead -- "j aime" -- which survives the
 * apostrophe strip as two words and never matches "j'aime"'s one-word
 * result. This is the direct French analogue of English's APOSTROPHE_LESS
 * list (STT dropping a marker character that normally joins two forms), so
 * it is handled the same way: join the pieces back together before the
 * generic punctuation strip runs.
 *
 * `si` is deliberately NOT here even though it elides (s'il, s'ils) --
 * unlike je/me/te/se/le/la/de/ne/ce/que, `si` only elides before "il"/"ils"
 * specifically, not before any vowel-initial word ("si elle" never becomes
 * "s'elle"). Handled as its own narrow rule below instead of the general
 * vowel-lookahead one, so it can't over-fire.
 */
const ELIDABLE = [
  "j",
  "m",
  "t",
  "s",
  "l",
  "d",
  "n",
  "c",
  "qu",
  "jusqu",
  "lorsqu",
  "puisqu",
  "quoiqu",
];
const VOWEL_OR_MUTE_H = "aeiouyàâäéèêëïîôöùûüh";

const ELISION_SPACE_JOINS: [RegExp, string][] = ELIDABLE.map((clitic) => [
  new RegExp(`\\b${clitic} (?=[${VOWEL_OR_MUTE_H}])`, "g"),
  clitic,
]);

/** `si` elides only before "il"/"ils" -- see ELIDABLE's comment. */
const SI_ELISION: [RegExp, string][] = [[/\bsi (ils?)\b/g, "s $1"]];

/** Hesitation noise Deepgram may transcribe as real text. Deliberately just
 * "euh" -- French has other candidates ("ben", "quoi", "genre") but each is
 * also a real word in common use ("quoi" = "what", "genre" = "kind of" as
 * well as "like"), so stripping them risks corrupting a genuine answer the
 * same way English's filler list avoids "well"/"like" for the same reason. */
const FILLER = /\b(?:euh|hum)\b/g;

/**
 * Single-word French numbers only, mirroring spoken-answer.ts's own
 * "compound numbers cannot be reconciled this way" limit -- but the cutoff
 * lands in a different place than English's, because French compounds start
 * earlier: dix-sept/dix-huit/dix-neuf (17-19) are two hyphenated words in
 * French where English's seventeen/eighteen/nineteen are one, so they are
 * excluded here the same way English excludes twenty-one. Continues at the
 * single-word round tens (vingt/trente/quarante/cinquante/soixante) and
 * stops before soixante-dix/quatre-vingts/quatre-vingt-dix (70/80/90),
 * which spec section 5.3 names explicitly as compounds to avoid in content.
 *
 * `un`/`une` ("one") are deliberately OMITTED. Unlike every other number
 * word, `un`/`une` is also the indefinite article ("a"/"an") in the
 * overwhelming majority of its occurrences -- mapping it unconditionally
 * would turn "un chat" (a cat) into "1 chat", corrupting an answer that was
 * never about counting. This is exactly the bare-word hazard spec section
 * 4.1 names by name: "un is also an article... the same bare-word hazard
 * that produced English's 44.8%-tagged-Verb disaster. Only map where
 * unambiguous." It is not unambiguous, so it is not mapped. Speak content
 * for French should avoid needing the number one spoken, the same way
 * English speak content avoids compound numbers rather than pretending this
 * handles them.
 */
const NUMBER_WORDS: [RegExp, string][] = [
  [/\bzéro\b/g, "0"],
  [/\bdeux\b/g, "2"],
  [/\btrois\b/g, "3"],
  [/\bquatre\b/g, "4"],
  [/\bcinq\b/g, "5"],
  [/\bsix\b/g, "6"],
  [/\bsept\b/g, "7"],
  [/\bhuit\b/g, "8"],
  [/\bneuf\b/g, "9"],
  [/\bdix\b/g, "10"],
  [/\bonze\b/g, "11"],
  [/\bdouze\b/g, "12"],
  [/\btreize\b/g, "13"],
  [/\bquatorze\b/g, "14"],
  [/\bquinze\b/g, "15"],
  [/\bseize\b/g, "16"],
  [/\bvingt\b/g, "20"],
  [/\btrente\b/g, "30"],
  [/\bquarante\b/g, "40"],
  [/\bcinquante\b/g, "50"],
  [/\bsoixante\b/g, "60"],
  [/\bcent\b/g, "100"],
  [/\bmille\b/g, "1000"],
];

export function normaliseSpokenFr(input: string): string {
  // Fold accents first, same as spoken-answer.ts and for the same reason:
  // the punctuation strip below deletes anything outside [a-z0-9\s], so
  // without this "élève" becomes "l ve" rather than matching "eleve". Reused
  // verbatim (spec section 4.1: "the existing NFD fold already handles
  // é/è/ê correctly... verify it, do not rewrite it") -- verified directly
  // against this module's own test vectors, not assumed.
  let s = input.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Join space-separated elisions before the generic apostrophe strip runs,
  // so "j ai" and "j'ai" converge on the same string the way "jai" already
  // does. `si` first: it must not be caught by the general list (it isn't
  // in ELIDABLE), and running it before or after the general list makes no
  // difference since they match disjoint words.
  for (const [pattern, replacement] of SI_ELISION) s = s.replace(pattern, replacement);
  for (const [pattern, replacement] of ELISION_SPACE_JOINS) s = s.replace(pattern, replacement);
  s = s.replace(/['’]/g, "");
  s = s.replace(FILLER, " ");
  for (const [pattern, replacement] of NUMBER_WORDS) s = s.replace(pattern, replacement);
  s = s.replace(/[^a-z0-9\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Whether `transcript` is the learner saying `expected`, in French.
 *
 * An empty transcript is false — but it means "nothing was captured", not
 * "said it wrong", matching spoken-answer.ts's matchesSpokenAnswer exactly.
 */
export function matchesSpokenAnswerFr(transcript: string, expected: string): boolean {
  const said = normaliseSpokenFr(transcript);
  if (!said) return false;
  return said === normaliseSpokenFr(expected);
}
