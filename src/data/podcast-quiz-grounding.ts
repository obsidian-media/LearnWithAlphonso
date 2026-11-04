import type { PodcastQuizQuestion } from "./podcast-quizzes";

/**
 * How well a transcript excerpt supports each answer choice, for the CI grounding test (no database read: the excerpts
 * are checked in next to the questions).
 *
 * A choice's "claim" is its content words that the prompt did not already say. The score is the share of that claim
 * the excerpt contains. A question is grounded when the right answer scores strictly higher than every wrong one, so
 * swapping the answer key to any other choice is detected: the swapped-in choice would score lower than the original.
 */

const STOP = new Set(
  // English
  (
    "the and you for are not can but how was who why did has had her his its our out any all may too yet nor per via " +
    "that this with from have they them their there what when which will would your about into than then were been " +
    "does only also very more most some such each both over under after before while where whom whose these those " +
    // French
    "les des une que qui est pas sur par vos mon son ses aux nos ils elle ont mes tes ces cet " +
    "aussi avec dans pour sont elles nous vous mais comme cette entre plus tout tous leur leurs quel quelle " +
    "quels quelles quand pourquoi combien comment fait font avoir etre ainsi alors donc encore deja " +
    // Spanish
    "los las una del por con que muy mas sus mis tus " +
    "para como pero esta este estos estas cual cuales cuando donde porque cuanto cuanta quien quienes tiene " +
    "tienen hace hacen todo todos sobre desde hasta ellos ellas"
  ).split(" "),
);

/** Lower-case, curly quotes straightened, accents kept (they matter in FR/ES), spacing collapsed. */
export function normText(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
}

/** Content tokens: words of 3+ letters (or any number) minus stop words, reduced to a 5-letter stem without plural -s. */
export function stems(s: string): string[] {
  const tokens = normText(s).match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens
    .filter((t) => /\p{N}/u.test(t) || (t.length >= 3 && !STOP.has(t)))
    .map((t) => (/\p{N}/u.test(t) ? t : (t.length > 4 ? t.replace(/(es|s)$/, "") : t).slice(0, 5)));
}

/** Share of the choice's own claim (words the prompt did not already say) that the excerpt contains. */
export function support(question: PodcastQuizQuestion, choiceIndex: number): number {
  const said = new Set(stems(question.prompt));
  const claim = [...new Set(stems(question.choices[choiceIndex]!))].filter((t) => !said.has(t));
  if (claim.length === 0) return 0;
  const excerpt = new Set(stems(question.evidence));
  return claim.filter((t) => excerpt.has(t)).length / claim.length;
}

/** True when the excerpt supports the key's answer strictly better than every other choice. */
export function isGrounded(question: PodcastQuizQuestion): boolean {
  const right = support(question, question.answerIndex);
  if (right <= 0) return false;
  return question.choices.every(
    (_, i) => i === question.answerIndex || support(question, i) < right,
  );
}
