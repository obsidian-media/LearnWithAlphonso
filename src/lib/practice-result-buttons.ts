import type { PracticeResult as Result } from "./practice-api";
import { MAX_STARS } from "./practice-stars";

/**
 * Which buttons the Practice result screen shows (the approved Practice hub v3 result screen, plus the 0-star
 * refinement). One pure function, so the web, iOS and Android tables stay the same and a test can pin every row.
 *
 * - `retry` sits on the left, `forward` on the right.
 * - A result with no stars makes "Try again" the gold button: retrying is the point. Done is quiet.
 * - A campaign scene that earned at least one star moves on with a gold "Next scene" (on the last scene, "Finish
 *   campaign"). With no star it never moves on: a talk counts done only from one star up (#511).
 * - At three stars there is nothing to try for, so a campaign scene shows only the gold forward button.
 * - A scenario talk (not a campaign) keeps its own buttons: retry (Try for N, or Play again) and a gold Done.
 */
export type ResultButtonTone = "gold" | "quiet";
export type ResultButton = {
  kind: "retry" | "next" | "finish" | "done";
  label: string;
  tone: ResultButtonTone;
};
export type ResultButtons = { retry: ResultButton | null; forward: ResultButton };

/** Shown when a finished call has no score (offline or unreachable). The same line on web, iOS and Android. */
export const UNSCORED_NOTICE =
  "You're offline, so this talk wasn't scored. Try again when you're back online.";

export function retryLabel(stars: number): string {
  if (stars >= MAX_STARS) return "Play again";
  return stars === 0 ? "Try again" : `Try for ${stars + 1}`;
}

export function practiceResultButtons({
  stars,
  campaign,
}: {
  stars: number;
  /** null for a scenario talk; for a campaign scene, whether it is the campaign's last. */
  campaign: { isLastScene: boolean } | null;
}): ResultButtons {
  const empty = stars === 0;
  const retry: ResultButton = {
    kind: "retry",
    label: retryLabel(stars),
    tone: empty ? "gold" : "quiet",
  };
  const done: ResultButton = { kind: "done", label: "Done", tone: empty ? "quiet" : "gold" };
  if (!campaign) return { retry, forward: done };
  if (empty) return { retry, forward: done };
  const forward: ResultButton = campaign.isLastScene
    ? { kind: "finish", label: "Finish campaign", tone: "gold" }
    : { kind: "next", label: "Next scene", tone: "gold" };
  return { retry: stars >= MAX_STARS ? null : retry, forward };
}

/**
 * The 0-star hint card's meter: replies given of replies needed to finish, from the server's tally. `given` never
 * passes `needed`, and a result without a finish count draws no meter.
 */
export function repliesMeter(r: Pick<Result, "replies" | "finishMinReplies">): {
  given: number;
  needed: number;
} | null {
  if (!(r.finishMinReplies > 0)) return null;
  return {
    given: Math.max(0, Math.min(r.replies, r.finishMinReplies)),
    needed: r.finishMinReplies,
  };
}

/** The chat-mode end-of-scene button (owner decision 2026-11-15). The same label on web, iOS and Android. */
export const SEE_MY_RESULT = "See my result";

/** It appears at the end of the transcript in chat mode, once the scene has its minimum turns (what Continue needed). */
export function seeResultShown(a: {
  chatMode: boolean;
  userTurns: number;
  minTurns: number;
  finished: boolean;
}): boolean {
  return a.chatMode && !a.finished && a.userTurns >= a.minTurns;
}
