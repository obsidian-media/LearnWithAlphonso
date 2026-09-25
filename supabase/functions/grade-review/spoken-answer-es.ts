// Deno copy of src/lib/spoken-answer-es.ts. Supabase Edge Functions bundle
// each function directory independently, so a relative import reaching
// outside supabase/functions/grade-review/ is not reliably resolvable --
// same reasoning as spoken-answer-fr.ts here.
//
// KEEP IN SYNC with the source of truth. This is not cosmetic duplication:
// the player grades a spoken answer with the original and shows the learner
// a verdict, and this copy then re-derives that verdict server-side. Any
// drift means the learner is told they were right and has the item lapsed
// anyway. spoken-answer-es.test.ts here mirrors the source's vectors and
// CI's deno-tests job fails on divergence.
//
// UNVERIFIED AGAINST REAL PRODUCTION TRANSCRIPTS -- see the source of
// truth's header comment for the full reasoning. Treat every rule below as
// a hypothesis to confirm once Spanish speak content is live, not settled
// fact.

// Spanish "h" is silent in every position except inside the digraph "ch"
// (its own consonant sound, /tʃ/) -- a categorical rule with no exceptions,
// so "hola" and "ola" are genuinely the same spoken word. Runs BEFORE the
// generic punctuation strip so it only ever touches the letter h.
function stripSilentH(input: string): string {
  return input.replace(/h/g, (match, offset: number, s: string) =>
    s[offset - 1]?.toLowerCase() === "c" ? match : "",
  );
}

// Deliberately just "eh" -- other candidates ("este", "o sea", "bueno") are
// also real words in common use, so stripping them risks corrupting a
// genuine answer.
const FILLER = /\b(?:eh)\b/g;

// Single-word Spanish numbers only. Every number 0-29 is a single word
// (dieciséis, veintidós, etc.), and the round tens/hundred/thousand
// (treinta, ..., noventa, cien, mil) are single words too. True compounds
// start at 31 ("treinta y uno"), excluded here. `un`/`una` ("one") are
// deliberately omitted: it is also the indefinite article in the
// overwhelming majority of its occurrences, and mapping it unconditionally
// would turn "un gato" (a cat) into "1 gato" -- the exact bare-word hazard
// spoken-answer-fr.ts's own NUMBER_WORDS comment names for un/une.
//
// Written unaccented (dieciseis, veintidos, veintitres, veintiseis) because
// normaliseSpokenEs folds accents BEFORE this list runs -- an accented
// pattern would never match the already-folded input.
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
  let s = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  // Filler before the silent-h strip, not after: "eh" IS an h-word, so
  // stripping the h first would turn it into "e" and the filler regex would
  // never see the whole word "eh" to match against.
  s = s.replace(FILLER, " ");
  s = stripSilentH(s);
  for (const [pattern, replacement] of NUMBER_WORDS) s = s.replace(pattern, replacement);
  s = s.replace(/[^a-z0-9\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

export function matchesSpokenAnswerEs(transcript: string, expected: string): boolean {
  const said = normaliseSpokenEs(transcript);
  if (!said) return false;
  return said === normaliseSpokenEs(expected);
}
