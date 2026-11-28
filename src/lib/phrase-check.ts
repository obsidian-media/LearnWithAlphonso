/**
 * Phrase mode ("Say it" in the phrasebook): how clearly a whole phrase came across. Pure functions only, WILL BE mirrored
 * one for one by LearnWithAlphonsoKit/Pronunciation.swift and core/logic/Pronunciation.kt; the shared cases in
 * tests/fixtures/phrase-check-cases.json pin all three apps to the same answers. It never produces a pronunciation
 * score: only "understood clearly", "mostly understood" (with up to two words to listen to again) or "not yet".
 *
 * THE RULES (the natives port exactly these):
 *
 *  1. Comparing form of a text, in this order:
 *     a. Unicode NFD, then remove every code point U+0300 to U+036F (the combining marks), then lower-case. Lower-casing
 *        is locale-invariant (Kotlin `Locale.ROOT`; Swift `lowercased()` is already invariant) and happens AFTER the
 *        mark strip, so from here on everything that matters is ASCII.
 *     b. U+2019, U+2018, U+02BC, U+0060 and U+00B4 become U+0027 ('). The ligatures U+0153 (oe) and U+00E6 (ae) are
 *        spelled "oe" and "ae".
 *     c. Every character outside a-z, 0-9 and ' becomes a space (this includes every kind of whitespace, so no
 *        platform's own whitespace class matters here). Split on spaces into PIECES.
 *     d. A contraction ending is joined: in a piece, an apostrophe that is followed by exactly t, s, m, d, ll, re or ve
 *        to the END of the piece is removed ("can't" -> "cant", "it's" -> "its", "I'm" -> "im", "we're" -> "were").
 *     e. Every remaining apostrophe splits the piece. A fragment BEFORE an apostrophe is an elision piece (l' d' j' m'
 *        t' s' n' c' qu' jusqu' lorsqu' puisqu' quoiqu'): a one-letter fragment, or one of qu, jusqu, lorsqu, puisqu,
 *        quoiqu, is dropped, and the token right after it is marked ELIDED. Any other fragment stays a token.
 *     f. A token is kept when it is at least 2 characters long, or when it is all digits (so "9" counts, "a" does not).
 *        What is left, in order, is the token list. Digits are never changed.
 *
 *  2. The expected phrase is split on whitespace into WORDS, the unit shown to the learner (original spelling, outer
 *     characters that are not letters, digits or combining marks trimmed: `\p{L}`, `\p{N}`, `\p{M}`). WHITESPACE here is
 *     exactly: U+0009-U+000D, U+0020, U+0085, U+00A0, U+1680, U+2000-U+200A, U+2028, U+2029, U+202F, U+205F, U+3000 and
 *     U+FEFF (Kotlin's `\s` is ASCII-only and Swift's `isWhitespace` omits U+FEFF, so port this list, not a built-in).
 *     A word whose own token list (rule 1 applied to it) is empty is ignored. No words left: "not_yet".
 *
 *  3. The heard text gets the same token list. No tokens: "not_yet". Heard words the expected phrase does not use
 *     (fillers such as "um", extra words) cost nothing.
 *
 *  4. Confidence: each entry of `words` (the recogniser's per-word list) is tokenised by rule 1; its tokens take that
 *     entry's confidence, queued per token in the order reported. An entry whose confidence is not a finite number (a
 *     string, NaN, infinity, missing) is skipped. The k-th heard token of a given spelling takes the k-th queued
 *     confidence for it; none queued means "unknown", which counts as clear. With no `words` at all (the vendor gave
 *     none) the check degrades to a text match only: every heard word is "unknown", so the result is clear or not_yet
 *     or mostly by presence alone.
 *
 *  5. Claiming. Expected words are visited in order; each expected token claims ONE still-unclaimed heard token; when
 *     several match, the one with the LOWEST index in the heard list wins. An expected token e is claimed by heard
 *     token h when:
 *       - h equals e; or
 *       - e is ELIDED, h is longer, and h is e preceded by one of l d j m t s n c qu jusqu lorsqu puisqu quoiqu (the
 *         recogniser glued the elision on: "jaime" for j'aime, "cest" for c'est); or
 *       - exactly one of e and h is all digits (at most 3 digits, read as a decimal integer) and the other is a number
 *         word of the table below with that same value ("neuf heures" heard as "9 heures", "10" heard for "diez",
 *         "twelve" heard for "12").
 *     Before its tokens are claimed one by one, an expected word with 2 or more tokens first tries its tokens joined
 *     into one string ("rendez" + "vous" = "rendezvous"); an unclaimed heard token equal to that claims the whole word.
 *     Nothing else is lenient: "can" is NOT matched by "can't" (heard "cant"), and "table" is NOT matched by "tables".
 *
 *  6. An expected word is FLAGGED when any of its tokens was not claimed, or was claimed by a heard token whose
 *     confidence is known and STRICTLY LESS than WORD_CONFIDENCE (0.7); exactly 0.7 is fine.
 *
 *  7. Nothing flagged: "clear". One or two flagged (MAX_LISTEN_AGAIN) AND no more than half of the words
 *     (flagged * 2 <= words): "mostly", with the flagged words, in phrase order, as `listenAgain`. Anything else:
 *     "not_yet" with an empty `listenAgain`.
 *
 * NUMBER WORDS (exact table; the value is the decimal integer; a spelling is accent-free as rule 1 leaves it):
 *   EN: zero 0, one 1, two 2, three 3, four 4, five 5, six 6, seven 7, eight 8, nine 9, ten 10, eleven 11, twelve 12,
 *       thirteen 13, fourteen 14, fifteen 15, sixteen 16, seventeen 17, eighteen 18, nineteen 19, twenty 20,
 *       thirty 30, forty 40, fifty 50, sixty 60, seventy 70, eighty 80, ninety 90, hundred 100.
 *   FR: zero 0, un 1, une 1, deux 2, trois 3, quatre 4, cinq 5, six 6, sept 7, huit 8, neuf 9, dix 10, onze 11,
 *       douze 12, treize 13, quatorze 14, quinze 15, seize 16, vingt 20, trente 30, quarante 40, cinquante 50,
 *       soixante 60, cent 100. (17-19 and 70/80/90 are compound words in French and are not in the table.)
 *   ES: cero 0, uno 1, una 1, dos 2, tres 3, cuatro 4, cinco 5, seis 6, siete 7, ocho 8, nueve 9, diez 10, once 11,
 *       doce 12, trece 13, catorce 14, quince 15, dieciseis 16, diecisiete 17, dieciocho 18, diecinueve 19, veinte 20,
 *       treinta 30, cuarenta 40, cincuenta 50, sesenta 60, setenta 70, ochenta 80, noventa 90, cien 100.
 *   The three lists are one table. A spelling that is a number in one language and an ordinary word in another (tres
 *   from French "tres", once) stays in it: it only ever matters against heard DIGITS of that value. Compound numbers
 *   ("twenty-one") are not handled: their parts are separate tokens.
 *
 * PORTING NOTES. Swift: work on Unicode scalars; use `decomposedStringWithCanonicalMapping` for NFD and filter scalars in
 * 0x0300...0x036F; do not use Character-level comparisons. Kotlin: `Normalizer.normalize(s, Normalizer.Form.NFD)` and
 * `lowercase(Locale.ROOT)` after the mark strip; do not use `\s`.
 */

/** One word of the transcript with the recogniser's own confidence for it (0-1), as `/api/stt` forwards it. */
export type HeardWord = { word: string; confidence: number };

/** How clearly a phrase came across: all of it, most of it, or not yet. */
export type PhraseResult = "clear" | "mostly" | "not_yet";

export type PhraseCheck = {
  result: PhraseResult;
  /** At most MAX_LISTEN_AGAIN words, copied from the EXPECTED phrase in its own spelling; only for "mostly". */
  listenAgain: string[];
};

/** A heard word with a known confidence STRICTLY below this (0-1) counts as not clearly understood. Tunable: one place. */
export const WORD_CONFIDENCE = 0.7;
/** "Mostly" names at most this many words, and never more than half of the phrase. */
export const MAX_LISTEN_AGAIN = 2;

const DROPPED_FRAGMENTS = new Set(["qu", "jusqu", "lorsqu", "puisqu", "quoiqu"]);
/** Elision prefixes a recogniser may glue onto the next word ("jaime" for j'aime). */
const GLUED_PREFIXES = new Set(["l", "d", "j", "m", "t", "s", "n", "c", ...DROPPED_FRAGMENTS]);

/** Rule 5's table: the value of each number word (EN, FR and ES together). */
export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  vingt: 20,
  trente: 30,
  quarante: 40,
  cinquante: 50,
  soixante: 60,
  cent: 100,
  cero: 0,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
};

/** The exact whitespace of rule 2. */
/* eslint-disable no-control-regex -- the tab to carriage-return range is part of the exact list */
const WHITESPACE =
  /[\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+/;
/* eslint-enable no-control-regex */
const MARKS = /[\u0300-\u036F]/g;

type Token = { token: string; elided: boolean };

/** Rule 1, with the elision marks kept. */
function tokenise(s: string): Token[] {
  const normalised = s
    .normalize("NFD")
    .replace(MARKS, "")
    .toLowerCase()
    .replace(/[\u2019\u2018\u02BC\u0060\u00B4]/g, "'")
    .replace(/\u0153/g, "oe")
    .replace(/\u00E6/g, "ae")
    .replace(/[^a-z0-9']/g, " ");
  const out: Token[] = [];
  for (const raw of normalised.split(" ")) {
    if (raw === "") continue;
    const piece = raw.replace(/(?<=[a-z0-9])'(t|s|m|d|ll|re|ve)$/, "$1");
    const parts = piece.split("'");
    let elided = false;
    parts.forEach((part, i) => {
      const before = i < parts.length - 1;
      if (before && (part.length === 1 || DROPPED_FRAGMENTS.has(part))) {
        elided = true;
        return;
      }
      if (part.length >= 2 || /^[0-9]+$/.test(part)) out.push({ token: part, elided });
      elided = false;
    });
  }
  return out;
}

/** Rule 1: the comparing tokens of a text. */
export function phraseTokens(s: string): string[] {
  return tokenise(s).map((t) => t.token);
}

const isDigits = (s: string) => /^[0-9]{1,3}$/.test(s);

function numberMatches(a: string, b: string): boolean {
  if (isDigits(a) && !isDigits(b)) return NUMBER_WORDS[b] === Number(a);
  if (isDigits(b) && !isDigits(a)) return NUMBER_WORDS[a] === Number(b);
  return false;
}

function claims(expected: Token, heard: string): boolean {
  if (expected.token === heard) return true;
  if (
    expected.elided &&
    heard.length > expected.token.length &&
    heard.endsWith(expected.token) &&
    GLUED_PREFIXES.has(heard.slice(0, heard.length - expected.token.length))
  )
    return true;
  return numberMatches(expected.token, heard);
}

/** Rule 2: the words of the expected phrase, each with the original spelling to show and its tokens. */
function expectedWords(expected: string): { shown: string; tokens: Token[] }[] {
  const out: { shown: string; tokens: Token[] }[] = [];
  for (const chunk of expected.split(WHITESPACE)) {
    const tokens = tokenise(chunk);
    if (tokens.length === 0) continue;
    out.push({
      shown: chunk.replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, ""),
      tokens,
    });
  }
  return out;
}

/** How clearly `heard` conveyed `expected`, given the recogniser's per-word confidences (see the rules above). */
export function checkPhrase(
  expected: string,
  heard: string,
  words: readonly HeardWord[] | null | undefined,
): PhraseCheck {
  const want = expectedWords(expected);
  const said = phraseTokens(heard);
  if (want.length === 0 || said.length === 0) return { result: "not_yet", listenAgain: [] };

  const queued = new Map<string, number[]>();
  for (const w of words ?? []) {
    if (!w || typeof w.word !== "string" || typeof w.confidence !== "number") continue;
    if (!Number.isFinite(w.confidence)) continue;
    for (const token of phraseTokens(w.word)) {
      const list = queued.get(token) ?? [];
      list.push(w.confidence);
      queued.set(token, list);
    }
  }
  const unclaimed = said.map((token) => ({
    token,
    confidence: queued.get(token)?.shift() ?? null,
  }));

  const unclear = (c: number | null) => c !== null && c < WORD_CONFIDENCE;
  const flagged: string[] = [];
  for (const { shown, tokens } of want) {
    let bad = false;
    const joined = tokens.length >= 2 ? tokens.map((t) => t.token).join("") : null;
    const whole = joined === null ? -1 : unclaimed.findIndex((h) => h.token === joined);
    if (whole >= 0) {
      const [hit] = unclaimed.splice(whole, 1);
      bad = unclear(hit.confidence);
    } else {
      for (const token of tokens) {
        const at = unclaimed.findIndex((h) => claims(token, h.token));
        if (at < 0) {
          bad = true;
          continue;
        }
        const [hit] = unclaimed.splice(at, 1);
        if (unclear(hit.confidence)) bad = true;
      }
    }
    if (bad) flagged.push(shown);
  }

  if (flagged.length === 0) return { result: "clear", listenAgain: [] };
  if (flagged.length <= MAX_LISTEN_AGAIN && flagged.length * 2 <= want.length) {
    return { result: "mostly", listenAgain: flagged };
  }
  return { result: "not_yet", listenAgain: [] };
}
