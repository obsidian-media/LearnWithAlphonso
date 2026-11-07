import type { Course } from "../data/courses";
import type { PracticeResult as Result } from "./practice-api";
import { MAX_STARS, STAR_RULE } from "./practice-stars";

/** The result screen's words, worked out from the server's result for the call. */
const PRAISE: Record<Course, string> = { en: "Well done.", fr: "Très bien.", es: "Muy bien." };
const COUNT = ["No stars", "One star", "Two stars", "Three stars"] as const;

export function headline(stars: number, course: Course): string {
  if (stars === 0) return "No stars this time";
  if (stars === MAX_STARS) return `${COUNT[3]}. ${PRAISE[course]}`;
  return `${COUNT[stars]}. ${stars === 2 ? PRAISE[course] : "You finished."}`;
}

/** What kept this call from its next star, from the server's tally. */
export function nextStarHint(r: Result): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (r.stars === 0) {
    const left = r.finishMinReplies - r.replies;
    return `Finish the call for your first star: ${plural(left, "more reply", "more replies")} next time.`;
  }
  if (r.stars === MAX_STARS) {
    return r.bestBefore === MAX_STARS
      ? "Three again. Nothing left to win here."
      : "Every reply right, in full sentences. Nothing left to win here.";
  }
  const wrong = r.replies - r.rightReplies;
  if (r.stars === 1) {
    return `${r.rightReplies} of ${r.replies} replies right. Two stars take ${STAR_RULE.twoStarMinRightPercent}%.`;
  }
  const reasons = [
    wrong > 0 && plural(wrong, "slip", "slips"),
    r.shortReplies > 0 && plural(r.shortReplies, "short reply", "short replies"),
    r.englishReplies > 0 && plural(r.englishReplies, "reply in English", "replies in English"),
  ].filter(Boolean) as string[];
  const what =
    reasons.length > 1 ? `${reasons.slice(0, -1).join(", ")} and ${reasons.at(-1)}` : reasons[0];
  return `${what[0].toUpperCase()}${what.slice(1)} kept you from three. Fix ${wrong + r.shortReplies + r.englishReplies === 1 ? "it" : "them"} and try again.`;
}
