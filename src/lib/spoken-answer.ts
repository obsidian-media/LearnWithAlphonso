/**
 * Comparing a speech-to-text transcript against the phrase a learner was asked
 * to say.
 *
 * A bare trim/lowercase is wrong here, because the same utterance comes back
 * transcribed differently run to run: "She's a doctor", "she is a doctor",
 * "Shes a doctor.", "um, she's a doctor". Grading those as misses would fail
 * learners for saying exactly the right thing.
 *
 * This lives in its own module because the rule has to be applied in more than
 * one place and they must agree. `deriveAnswerCorrectness` (src/lib/srs.ts)
 * uses it, and the review server re-derives correctness independently — if the
 * two disagreed, the player would show "Still got it" and the server would
 * lapse the item behind the learner's back.
 *
 * Deliberately NOT edit distance. A threshold loose enough to forgive
 * "she is"/"she's" also accepts "he is a driver" for "she is a doctor", and on
 * phrases this short that trade is strictly worse than exactness after
 * normalisation.
 */

/**
 * Expanded rather than contracted, so "don't" and "do not" converge on one
 * form. Only contractions that actually appear in spoken practice content are
 * listed; this is not meant to be exhaustive English.
 */
const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, "can not"],
  // "cannot" is one word and never contracts to "can't" by the rule below, so
  // without this a learner saying "I can't agree" is marked wrong for a phrase
  // written "I cannot agree" -- which b1p22 contains.
  [/\bcannot\b/g, "can not"],
  [/\bwon't\b/g, "will not"],
  // "let's" is "let us", NOT "let is" -- it must be expanded before the generic
  // 's rule below gets to it. Without this the apostrophe-ful and
  // apostrophe-less spellings of the SAME word disagree, because
  // APOSTROPHE_LESS already maps bare "lets" to "let us".
  [/\blet's\b/g, "let us"],
  // No \b before n't: the boundary needs a non-word char there, and in "don't"
  // the preceding "o" is a word char, so an anchored version never fires at all
  // (it looked like it worked only because APOSTROPHE_LESS catches the common
  // words after the apostrophes are stripped). Unanchored, this covers the ones
  // that are not in that list -- "mustn't", "needn't", "shan't", "oughtn't".
  [/n't\b/g, " not"],
  [/\b'll\b/g, " will"],
  [/\b're\b/g, " are"],
  [/\b've\b/g, " have"],
  [/\b'd\b/g, " would"],
  // AMBIGUOUS, and knowingly so: 's is "is", "has" and the possessive at once,
  // and nothing here can tell them apart ("he's finished" is "he has
  // finished"). Expanding to "is" is right for the common case a speaking
  // question actually uses ("she's a doctor"), so the rule stays -- and the
  // CONTENT avoids the other two, because a phrase written "He has already
  // finished" would be marked wrong for a learner who said it perfectly and
  // contracted it. See the pack comments in lesson-bank.ts.
  [/\b's\b/g, " is"],
  [/\b'm\b/g, " am"],
];

/**
 * The same contractions as written WITHOUT an apostrophe, which is how speech
 * recognition frequently returns them ("shes a doctor", "dont understand").
 * Without this the apostrophe-anchored rules above never fire on a transcript
 * and a correct utterance is graded wrong.
 *
 * Every key here is a non-word in English, deliberately: expanding "were" or
 * "well" or "ill" would corrupt real words ("we were ready", "sleeping well"),
 * so those forms are left alone even though it means missing a few variants.
 * Under-matching costs a retry; over-matching marks a wrong answer right.
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

/** Hesitation noises Deepgram transcribes but nobody means to say. */
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
  // Fold accents to their base letters FIRST. The punctuation strip below
  // deletes anything outside [a-z0-9\s], so without this "café" becomes "caf"
  // and no longer matches "cafe" -- and speech recognition returns the
  // accented spelling for loanwords whichever way the phrase was written.
  let s = input.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // Expand while the apostrophes are still present...
  for (const [pattern, replacement] of CONTRACTIONS) s = s.replace(pattern, replacement);
  s = s.replace(/['’]/g, "");
  // ...then again for the apostrophe-less spellings speech recognition emits.
  for (const [pattern, replacement] of APOSTROPHE_LESS) s = s.replace(pattern, replacement);
  s = s.replace(FILLER, " ");
  for (const [pattern, replacement] of NUMBER_WORDS) s = s.replace(pattern, replacement);
  s = s.replace(/[^a-z0-9\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Whether `transcript` is the learner saying `expected`.
 *
 * An empty transcript is false — but it means "nothing was captured", not "said
 * it wrong", and callers must not spend a heart on it. Recording failures reach
 * here looking identical to silence.
 */
export function matchesSpokenAnswer(transcript: string, expected: string): boolean {
  const said = normaliseSpoken(transcript);
  if (!said) return false;
  return said === normaliseSpoken(expected);
}
