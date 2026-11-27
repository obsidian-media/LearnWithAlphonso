import type { RehearsalError } from "./rehearsal-api";
import { EVENT_SHORT, type EventKind, type Stage } from "./rehearsal-rules";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The Pro sheet's paragraph: what the learner already did, from the closed rehearsal's counts. Numbers only (never a
 * score), and what is zero is left out.
 */
export function paywallSummary(
  done: { eventKind: EventKind; runs: number; stagesDone: number; corrections: number } | null,
): string {
  if (!done || done.runs === 0)
    return "You have used your free rehearsal with Alphonso (AI). A new rehearsal needs Pro.";
  const stages = done.stagesDone >= 3 ? "all 3 stages" : `${done.stagesDone} of 3 stages`;
  const parts = [stages, plural(done.runs, "run", "runs")];
  if (done.corrections > 0)
    parts.push(`${plural(done.corrections, "mistake", "mistakes")} sent to Fix before it sticks`);
  const list =
    parts.length === 3
      ? `${parts[0]}, ${parts[1]}, and ${parts[2]}`
      : `${parts[0]} and ${parts[1]}`;
  return `You rehearsed your ${EVENT_SHORT[done.eventKind]} with Alphonso (AI): ${list}. A new rehearsal, for a meeting, a landlord or a first day, needs Pro.`;
}

/** The debrief card's headline. */
export function debriefTitle(stage: Stage, kind: EventKind): string {
  if (stage === "conversation") return `That was a full ${EVENT_SHORT[kind]}`;
  if (stage === "warmup") return "That was your warm-up";
  return "That was the hard moments";
}

/** What a refused request says to the learner. */
export const REHEARSAL_ERROR_TEXT: Record<RehearsalError, string> = {
  paywall:
    "You have used your free rehearsal. More rehearsals are part of Alphonso Pro, and your first one stays here to look back on.",
  retry: "We could not check your plan just now. Please try again in a moment.",
  blocked_text: "Some of those words can't be used here. Please rephrase and try again.",
  active_exists: "You already have a rehearsal going for this course.",
  closed: "This rehearsal is already finished.",
  not_found: "We could not find that rehearsal.",
  not_enabled: "Rehearsals are not available yet.",
  invalid: "Please check your answers and try again.",
  consent: "Turn on AI features to prepare a rehearsal.",
  failed: "Something went wrong. Please try again.",
};
