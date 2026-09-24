import { ANSWER_POS } from "@/data/answer-pos";

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
 * scripts/gen-answer-pos.ts), so an unknown word simply expresses no
 * preference rather than a guessed one, and no tagging library reaches the
 * client bundle or app startup path.
 */
export function orderDistractorCandidates(
  answer: string,
  candidates: string[],
  prompt?: string,
): string[] {
  const answerPos = ANSWER_POS[answer];
  const promptWords = prompt ? wordsIn(prompt) : null;
  if (!answerPos && !promptWords) return candidates;

  // Lower rank sorts earlier. Rank 0 is the ideal distractor: right word class,
  // not already sitting in the sentence.
  const rank = (candidate: string): number => {
    const wrongClass = answerPos ? (ANSWER_POS[candidate] ?? answerPos) !== answerPos : false;
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
