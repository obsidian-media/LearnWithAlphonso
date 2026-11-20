import type { Verdict } from "./pronunciation";

/**
 * Say it right ("Talk with Alphonso"): the derived state behind the 1:1 lesson. Pure functions only, mirrored one for
 * one by LearnWithAlphonsoKit/Pronunciation.swift and core/logic/Pronunciation.kt, so the three apps say the same
 * things in the same poses. The scoring itself (judgeAttempt, bands, stars) is unchanged and lives in pronunciation.ts.
 */

/** The mic ring/auto-stop length, matching Say the picture (6 s). */
export { MAX_RECORD_MS } from "./say-the-picture";

/**
 * A press released sooner than this is a TAP: it latches the recording on and a second tap stops it. A longer hold is
 * hold-to-talk and its release sends. Same on iOS and Android.
 */
export const LATCH_MS = 300;

/** Whether releasing the mic after `heldMs` stops (and sends) the recording; a quick tap keeps recording instead. */
export function releaseStops(heldMs: number): boolean {
  return heldMs >= LATCH_MS;
}

/** Alphonso's in-pose reactions, by file name under /figures (alphonso-<pose>.webp). */
export type SirPose =
  | "explaining-pointer"
  | "listening-headphones"
  | "thinking-temple"
  | "levelup-cheer"
  | "surprised-impressed";

/** Where the round is: asking, the one retry after a miss, the result, or the wrap. */
export type SirPhase = "ask" | "retry" | "result" | "done";

/** Warm lines per band. Never "wrong". Index order is part of the contract (the other platforms mirror it). */
export const PRAISE: Record<Verdict, readonly string[]> = {
  great: ["Spot on!", "You've got it!", "Lovely!", "Beautifully said!", "That was clear!"],
  almost: [
    "So close. A touch clearer.",
    "Nearly there. Once more, nice and clear.",
    "Almost! Listen, then try again.",
  ],
  again: [
    "Let's try that one together.",
    "No rush. Listen, then say it with me.",
    "Let's hear it once more.",
  ],
};

/** After the one retry still misses: a kind move-on line. */
export const MOVE_ON = "Good try. It gets easier each time.";

export const BUBBLE = {
  ask: "Say this one after me",
  listening: "I'm listening…",
  checking: "Let me hear how clear that was…",
  retry: "Listen, then try once more.",
} as const;

/**
 * Index of the next line from a bank of `size`, never equal to `last` (so the same line is never said twice in a row).
 * `roll` is a number in [0, 1): inject it in tests, pass Math.random() in the app. A bank of one just repeats.
 */
export function nextLineIndex(size: number, last: number | null, roll: number): number {
  if (size <= 1) return 0;
  const clamped = Math.min(Math.max(roll, 0), 0.999999);
  if (last === null || last < 0 || last >= size) return Math.floor(clamped * size);
  const i = Math.floor(clamped * (size - 1));
  return i >= last ? i + 1 : i;
}

/**
 * Which pose Alphonso is in. Asking he explains, while the learner talks (or the clip is being checked) he listens;
 * after a miss he thinks it through with them; on a great he cheers or is impressed, alternating by how many greats
 * there have been so far (`greatCount`, counting this one) so a run of wins varies.
 */
export function poseFor(
  phase: SirPhase,
  listening: boolean,
  verdict: Verdict | null,
  greatCount: number,
): SirPose {
  if (listening) return "listening-headphones";
  if (phase === "done") return "levelup-cheer";
  if (phase === "retry") return "thinking-temple";
  if (phase === "result") {
    if (verdict === "great") return greatCount % 2 === 1 ? "levelup-cheer" : "surprised-impressed";
    return "thinking-temple";
  }
  return "explaining-pointer";
}

/** The wrap line: "N of M clearly". */
export function clearlyLine(clear: number, total: number): string {
  return `${clear} of ${total} clearly`;
}
