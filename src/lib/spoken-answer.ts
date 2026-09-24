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
  [/\bwon't\b/g, "will not"],
  [/\bn't\b/g, " not"],
  [/\b'll\b/g, " will"],
  [/\b're\b/g, " are"],
  [/\b've\b/g, " have"],
  [/\b'd\b/g, " would"],
  // Possessive and "is" share this form; spoken practice phrases use it as
  // "is" ("she's a doctor"), and treating a possessive as "is" only ever makes
  // two spellings of the same utterance agree.
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

export function normaliseSpoken(input: string): string {
  let s = input.toLowerCase();
  // Expand while the apostrophes are still present...
  for (const [pattern, replacement] of CONTRACTIONS) s = s.replace(pattern, replacement);
  s = s.replace(/['’]/g, "");
  // ...then again for the apostrophe-less spellings speech recognition emits.
  for (const [pattern, replacement] of APOSTROPHE_LESS) s = s.replace(pattern, replacement);
  s = s.replace(FILLER, " ");
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
