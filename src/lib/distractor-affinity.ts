import { ANSWER_POS, PACK_ANSWER_POS } from "@/data/answer-pos";

/**
 * Hand-labelled classes for one pack, or an empty object for a pack that needs
 * none -- which is most of them, because a pool whose answers are all one class
 * cannot produce a cross-class distractor.
 */
export function packAnswerPos(packId: string): Record<string, string> {
  return PACK_ANSWER_POS[packId] ?? {};
}

/**
 * Orders distractor candidates so the most useful wrong answers come first.
 *
 * Distractors are drawn mechanically from a pack's own pool of answers, and a
 * cloze pack's pool legitimately mixes word classes -- a "Daily Routine" pack
 * holds verbs, nouns and adverbs together. Left unordered, that produced wrong
 * answers a learner never has to think about, just broken ones:
 * "I need to ___ some money" offered the noun "money" for a verb slot, and
 * "He's ___ into debt because of his spending" echoed "spending" back.
 *
 * Two preferences, applied in order:
 *   1. shares the answer's part of speech (so it is grammatically possible)
 *   2. does not already appear in the prompt (so it is not the sentence
 *      repeated back)
 *
 * Both are preferences, never filters. The function REORDERS and never drops,
 * for two reasons: returning fewer candidates could push `pickDistractors`
 * below three and flip a question between fill and mc (see `useMc` in
 * lesson-bank.ts), and grammar packs genuinely need prompt words as choices --
 * a mixed conditional drilling "If he HAD taken the job, he ___ be living
 * abroad" wants "had" offered. Ordering changes which wrong answers appear; it
 * cannot change a question's type or its id.
 *
 * Ordering is stable within each group, preserving the caller's hashed walk
 * order, which is what makes different questions in a pack draw different
 * distractors.
 *
 * Part-of-speech tags come from a precomputed map (see
 * scripts/gen-answer-pos.ts), so no tagging library reaches the client bundle or
 * the app startup path. A word the generator could not read consistently is left
 * untagged rather than guessed at.
 *
 * `overrides` carries hand labels for a pack whose pool mixes word classes, and
 * is consulted first. It exists because the corpus-wide map cannot hold two true
 * readings of one word -- `light` is a noun in a1p18 and an adjective in a1p15 --
 * and dropping the word is not a neutral abstention. See `rank`.
 */
export function orderDistractorCandidates(
  answer: string,
  candidates: string[],
  prompt?: string,
  /** Hand labels for the pack these candidates came from -- see packAnswerPos. */
  overrides: Record<string, string> = {},
): string[] {
  const posOf = (word: string): string | undefined => overrides[word] ?? ANSWER_POS[word];
  const answerPos = posOf(answer);
  const promptWords = prompt ? wordsIn(prompt) : null;
  if (!answerPos && !promptWords) return candidates;

  // Lower rank sorts earlier. Rank 0 is the ideal distractor: right word class,
  // not already sitting in the sentence.
  const rank = (candidate: string): number => {
    // An untagged candidate resolves to the ANSWER's class, i.e. ranks as a
    // perfect match. That default is deliberate -- demoting unknowns was measured
    // and rejected, because 150 of the bank's 2,675 questions have fewer than
    // three known same-class candidates and would draw the same handful every
    // time -- but it means a MISSING tag is a promotion, not an abstention. Any
    // change that removes tags therefore makes questions worse while looking
    // conservative; one did, degrading 43 questions across 11 packs.
    const wrongClass = answerPos ? (posOf(candidate) ?? answerPos) !== answerPos : false;
    const inPrompt = promptWords ? promptWords.has(candidate.trim().toLowerCase()) : false;
    return (wrongClass ? 2 : 0) + (inPrompt ? 1 : 0);
  };

  return candidates
    .map((candidate, index) => ({ candidate, index, rank: rank(candidate) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.candidate);
}

/**
 * Function words carry no discriminating power when judging how confusable two
 * sentences are -- every sentence shares them.
 */
const FUNCTION_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "to",
  "of",
  "and",
  "or",
  "in",
  "on",
  "at",
  "it",
  "its",
  "this",
  "that",
  "with",
  "has",
  "have",
  "had",
  "for",
  "i",
  "we",
  "they",
  "he",
  "she",
  "my",
  "his",
  "her",
  "their",
]);

function contentWords(sentence: string): string[] {
  return [...wordsIn(sentence)].filter((w) => !FUNCTION_WORDS.has(w));
}

/**
 * Orders candidates so the sentence most easily confused with `answer` comes
 * first, measured by shared content words.
 *
 * This is for listening questions, and it is the OPPOSITE aim of
 * `orderDistractorCandidates`. There, a good distractor is one that could
 * grammatically occupy the blank; here the whole sentence is the answer, and a
 * good distractor is one the learner might mishear it as. Four unrelated
 * sentences make a word-spotting exercise -- catching one content word decides
 * it without parsing anything -- which is what this repo's listening content
 * measured as before this existed: 0 of 125 questions had a distractor sharing
 * even half the answer's content words.
 *
 * Reorders and never drops, like its sibling, so it cannot change a question's
 * choice count. Ties keep the caller's order, preserving the hashed walk's
 * variety between questions.
 */
export function orderByLexicalSimilarity(answer: string, candidates: string[]): string[] {
  const target = contentWords(answer);
  if (target.length === 0) return candidates;
  return candidates
    .map((candidate, index) => {
      const words = contentWords(candidate);
      const shared = target.filter((w) => words.includes(w)).length;
      return { candidate, index, shared };
    })
    .sort((a, b) => b.shared - a.shared || a.index - b.index)
    .map((entry) => entry.candidate);
}

function wordsIn(prompt: string): Set<string> {
  return new Set(
    prompt
      .toLowerCase()
      .replace(/_+/g, " ")
      .replace(/[^a-z\s'-]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
}
