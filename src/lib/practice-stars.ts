import type { Course } from "../data/courses";

/**
 * The star rule for a Practice call (BACKLOG 0.0-bj, owner: "really strict"). Every scenario and every campaign
 * scene earns 0 to 3 stars from how one call went, and the best is kept. This module is the ONE place the numbers
 * live: tune them here. The server applies the rule (src/routes/api/chat.ts measures and records each reply,
 * src/routes/api/practice.ts finishes the call); the pre-call sheet and the result screen word it from the same
 * constants, so the rule a learner reads is the rule that is applied.
 *
 * - 1 star: the call was finished (at least `scenarioFinishMinReplies` replies; a campaign scene uses its own
 *   minTurns, the same number that unlocks its "Continue").
 * - 2 stars: at least `twoStarMinRightPercent`% of the replies were judged right ("correct" from the reply verdict
 *   in chat-verdict.ts). A reply the model did not judge right, a correction or "none" (a question, a greeting),
 *   counts against the share.
 * - 3 stars: every reply judged right AND every reply at least `threeStarMinWords` words in the course language
 *   AND no reply fell back to English.
 */
export const STAR_RULE = {
  scenarioFinishMinReplies: 3,
  twoStarMinRightPercent: 80,
  threeStarMinWords: 4,
  /** A reply in a French or Spanish course is "English" when at least this share of its words are English. */
  englishFallbackMinShare: 0.25,
} as const;

export const MAX_STARS = 3;

/** The rule in words, from the same constants the server scores with. */
export const STAR_RULE_LINES: readonly [number, string][] = [
  [1, "Finish the call"],
  [2, `${STAR_RULE.twoStarMinRightPercent}% of your replies right`],
  [3, `Every reply right, in full sentences of ${STAR_RULE.threeStarMinWords}+ words, no English`],
];

/** What the server has recorded about one call's replies. */
export type CallTally = {
  replies: number;
  /** Replies judged "correct". */
  rightReplies: number;
  /** Replies with fewer than `threeStarMinWords` words in the course language. */
  shortReplies: number;
  /** Replies that fell back to English. */
  englishReplies: number;
};

/** 0 (not finished) to 3. Integer arithmetic only, so 4 of 5 is exactly 80% and never 79.999...%. */
export function starsForCall(t: CallTally, finishMinReplies: number): 0 | 1 | 2 | 3 {
  if (t.replies < Math.max(1, finishMinReplies)) return 0;
  const allRight = t.rightReplies >= t.replies;
  if (allRight && t.shortReplies === 0 && t.englishReplies === 0) return 3;
  if (t.rightReplies * 100 >= t.replies * STAR_RULE.twoStarMinRightPercent) return 2;
  return 1;
}

/**
 * English words that are not also French or Spanish words. Deliberately left out: "a", "he" (Spanish "he
 * hablado"), "no", "me", "on" and "son" (French), "do", "can", "con", "an", "i" and "se". A word list is a
 * heuristic, so it is short and only holds words a learner reaching for English actually says.
 */
const ENGLISH_MARKERS: ReadonlySet<string> = new Set([
  "the",
  "is",
  "are",
  "was",
  "were",
  "i'm",
  "it's",
  "don't",
  "can't",
  "you",
  "your",
  "my",
  "and",
  "to",
  "of",
  "it",
  "this",
  "that",
  "what",
  "how",
  "why",
  "where",
  "when",
  "please",
  "thank",
  "thanks",
  "yes",
  "yeah",
  "hello",
  "hi",
  "sorry",
  "would",
  "like",
  "have",
  "has",
  "with",
  "for",
  "but",
  "we",
  "they",
  "she",
  "want",
  "not",
  "know",
  "think",
  "okay",
  "just",
  "really",
  "because",
  "about",
  "some",
  "very",
  "good",
]);

const WORD = /[\p{L}\p{M}'’-]*\p{L}[\p{L}\p{M}'’-]*/gu;

export type ReplyMeasure = {
  /** Words in the course language: every word in the English course, the non-English words otherwise. */
  courseWords: number;
  /** Under the three-star word minimum. */
  short: boolean;
  /** Fell back to English (never true in the English course). */
  english: boolean;
};

/** Measured on the server, from the text the learner actually sent to /api/chat. */
export function measureReply(text: string, course: Course): ReplyMeasure {
  const words = (text.match(WORD) ?? []).map((w) => w.toLowerCase().replace(/’/g, "'"));
  const englishWords = course === "en" ? 0 : words.filter((w) => ENGLISH_MARKERS.has(w)).length;
  const courseWords = words.length - englishWords;
  const english =
    englishWords > 0 && englishWords >= words.length * STAR_RULE.englishFallbackMinShare;
  return { courseWords, short: courseWords < STAR_RULE.threeStarMinWords, english };
}
