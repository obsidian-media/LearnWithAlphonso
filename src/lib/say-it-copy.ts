import type { PhraseCheck } from "./phrase-check";

/**
 * The words under a phrase after "Say it". They describe how clearly the learner was UNDERSTOOD, never a pronunciation
 * score, and are neutral in tone (no "wrong", no red). The same three lines on every platform.
 */
export const SAY_IT_CHECKING = "Checking how clearly that came across…";
export const SAY_IT_LISTENING = "Listening…";
export const SAY_IT_FRAMING = "Say a phrase to hear how clearly you were understood.";

export function sayItResultText(check: PhraseCheck): string {
  if (check.result === "clear") return "Understood clearly";
  if (check.result === "mostly") {
    const [a, b] = check.listenAgain;
    if (a && b) return `Mostly understood: listen to “${a}” and “${b}” again`;
    if (a) return `Mostly understood: listen to “${a}” again`;
    return "Mostly understood";
  }
  return "Not understood yet: try again";
}
