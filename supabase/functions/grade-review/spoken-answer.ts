// Deno copy of src/lib/spoken-answer.ts. Supabase Edge Functions bundle each
// function directory independently, so a relative import reaching outside
// supabase/functions/grade-review/ is not reliably resolvable -- same reasoning
// as srs.ts here and complete-lesson/progress-math.ts.
//
// KEEP IN SYNC with the source of truth. This is not cosmetic duplication: the
// player grades a spoken answer with the original and shows the learner a
// verdict, and this copy then re-derives that verdict server-side. Any drift
// means the learner is told they were right and has the item lapsed anyway.
// spoken-answer.test.ts here mirrors the source's vectors and CI's deno-tests
// job fails on divergence.

const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, "can not"],
  [/\bwon't\b/g, "will not"],
  [/\bn't\b/g, " not"],
  [/\b'll\b/g, " will"],
  [/\b're\b/g, " are"],
  [/\b've\b/g, " have"],
  [/\b'd\b/g, " would"],
  [/\b's\b/g, " is"],
  [/\b'm\b/g, " am"],
];

/**
 * The same contractions written WITHOUT an apostrophe, which is how speech
 * recognition frequently returns them. Every key is a non-word in English on
 * purpose -- expanding "were", "well" or "ill" would corrupt real words.
 */
const APOSTROPHE_LESS: [RegExp, string][] = [
  [/\bcant\b/g, "can not"],
  [/\bwont\b/g, "will not"],
  [/\bdont\b/g, "do not"],
  [/\bdoesnt\b/g, "does not"],
  [/\bdidnt\b/g, "did not"],
  [/\bisnt\b/g, "is not"],
  [/\barent\b/g, "are not"],
  [/\bwasnt\b/g, "was not"],
  [/\bwerent\b/g, "were not"],
  [/\bhasnt\b/g, "has not"],
  [/\bhavent\b/g, "have not"],
  [/\bhadnt\b/g, "had not"],
  [/\bcouldnt\b/g, "could not"],
  [/\bwouldnt\b/g, "would not"],
  [/\bshouldnt\b/g, "should not"],
  [/\bshes\b/g, "she is"],
  [/\bhes\b/g, "he is"],
  [/\btheres\b/g, "there is"],
  [/\bthats\b/g, "that is"],
  [/\bwhats\b/g, "what is"],
  [/\blets\b/g, "let us"],
  [/\bim\b/g, "i am"],
  [/\bive\b/g, "i have"],
  [/\byoure\b/g, "you are"],
  [/\btheyre\b/g, "they are"],
  [/\byouve\b/g, "you have"],
  [/\bweve\b/g, "we have"],
];

const FILLER = /\b(?:um|uh|erm|er|ah)\b/g;

/**
 * Number words collapsed onto digits, because /api/stt calls Deepgram with
 * `smart_format=true`, which returns spoken numbers as numerals: say "the bus
 * leaves at nine" and the transcript reads "the bus leaves at 9". Without this
 * the two spellings of the same utterance never match and a learner who said
 * the phrase perfectly is marked wrong.
 *
 * Single words only. Compound numbers cannot be reconciled this way --
 * "twenty one" is two words here and "21" is one in the transcript -- so
 * spoken content avoids them rather than pretending this handles them.
 */
const NUMBER_WORDS: [RegExp, string][] = [
  [/\bzero\b/g, "0"],
  [/\bone\b/g, "1"],
  [/\btwo\b/g, "2"],
  [/\bthree\b/g, "3"],
  [/\bfour\b/g, "4"],
  [/\bfive\b/g, "5"],
  [/\bsix\b/g, "6"],
  [/\bseven\b/g, "7"],
  [/\beight\b/g, "8"],
  [/\bnine\b/g, "9"],
  [/\bten\b/g, "10"],
  [/\beleven\b/g, "11"],
  [/\btwelve\b/g, "12"],
  [/\bthirteen\b/g, "13"],
  [/\bfourteen\b/g, "14"],
  [/\bfifteen\b/g, "15"],
  [/\bsixteen\b/g, "16"],
  [/\bseventeen\b/g, "17"],
  [/\beighteen\b/g, "18"],
  [/\bnineteen\b/g, "19"],
  [/\btwenty\b/g, "20"],
  [/\bthirty\b/g, "30"],
  [/\bforty\b/g, "40"],
  [/\bfifty\b/g, "50"],
  [/\bsixty\b/g, "60"],
  [/\bseventy\b/g, "70"],
  [/\beighty\b/g, "80"],
  [/\bninety\b/g, "90"],
];

export function normaliseSpoken(input: string): string {
  let s = input.toLowerCase();
  for (const [pattern, replacement] of CONTRACTIONS) s = s.replace(pattern, replacement);
  s = s.replace(/['’]/g, "");
  for (const [pattern, replacement] of APOSTROPHE_LESS) s = s.replace(pattern, replacement);
  s = s.replace(FILLER, " ");
  for (const [pattern, replacement] of NUMBER_WORDS) s = s.replace(pattern, replacement);
  s = s.replace(/[^a-z0-9\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

export function matchesSpokenAnswer(transcript: string, expected: string): boolean {
  const said = normaliseSpoken(transcript);
  if (!said) return false;
  return said === normaliseSpoken(expected);
}
