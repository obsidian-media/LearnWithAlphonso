// Deno copy of src/lib/spoken-answer-fr.ts. Supabase Edge Functions bundle
// each function directory independently, so a relative import reaching
// outside supabase/functions/grade-review/ is not reliably resolvable --
// same reasoning as spoken-answer.ts here and complete-lesson/progress-math.ts.
//
// KEEP IN SYNC with the source of truth. This is not cosmetic duplication:
// the player grades a spoken answer with the original and shows the learner
// a verdict, and this copy then re-derives that verdict server-side. Any
// drift means the learner is told they were right and has the item lapsed
// anyway. spoken-answer-fr.test.ts here mirrors the source's vectors and
// CI's deno-tests job fails on divergence.
//
// UNVERIFIED AGAINST REAL PRODUCTION TRANSCRIPTS -- see the source of
// truth's header comment for the full reasoning. Treat every rule below as
// a hypothesis to confirm once French speak content is live, not settled
// fact.

const ELIDABLE = ["j", "m", "t", "s", "l", "d", "n", "c", "qu", "jusqu", "lorsqu", "puisqu", "quoiqu"];
const VOWEL_OR_MUTE_H = "aeiouyàâäéèêëïîôöùûüh";

const ELISION_SPACE_JOINS: [RegExp, string][] = ELIDABLE.map((clitic) => [
  new RegExp(`\\b${clitic} (?=[${VOWEL_OR_MUTE_H}])`, "g"),
  clitic,
]);

// `si` elides only before "il"/"ils" -- not before any vowel-initial word
// ("si elle" never becomes "s'elle"), so it is its own narrow rule rather
// than a member of ELIDABLE.
const SI_ELISION: [RegExp, string][] = [[/\bsi (ils?)\b/g, "s $1"]];

// Deliberately just "euh"/"hum" -- other candidates ("ben", "quoi", "genre")
// are also real words in common use, so stripping them risks corrupting a
// genuine answer.
const FILLER = /\b(?:euh|hum)\b/g;

// Single-word French numbers only. dix-sept/dix-huit/dix-neuf (17-19) are
// excluded as two-word compounds (unlike English's one-word seventeen/
// eighteen/nineteen), and soixante-dix/quatre-vingts/quatre-vingt-dix
// (70/80/90) are excluded per the design spec. `un`/`une` ("one") are
// deliberately omitted: it is also the indefinite article in the
// overwhelming majority of its occurrences, and mapping it unconditionally
// would turn "un chat" (a cat) into "1 chat" -- the exact bare-word hazard
// the design spec names by name.
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
  let s = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  for (const [pattern, replacement] of SI_ELISION) s = s.replace(pattern, replacement);
  for (const [pattern, replacement] of ELISION_SPACE_JOINS) s = s.replace(pattern, replacement);
  s = s.replace(/['’]/g, "");
  s = s.replace(FILLER, " ");
  for (const [pattern, replacement] of NUMBER_WORDS) s = s.replace(pattern, replacement);
  s = s.replace(/[^a-z0-9\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

export function matchesSpokenAnswerFr(transcript: string, expected: string): boolean {
  const said = normaliseSpokenFr(transcript);
  if (!said) return false;
  return said === normaliseSpokenFr(expected);
}
