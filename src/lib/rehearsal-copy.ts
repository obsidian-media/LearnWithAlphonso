import type { RehearsalError } from "./rehearsal-api";

/** What a refused request says to the learner. */
export const REHEARSAL_ERROR_TEXT: Record<RehearsalError, string> = {
  paywall:
    "You have used your free rehearsal. More rehearsals are part of Alphonso Pro, and your first one stays here to look back on.",
  retry: "We could not check your plan just now. Please try again in a moment.",
  blocked_text: "Some of those words can't be used here. Please rephrase and try again.",
  active_exists: "You already have a rehearsal going for this course.",
  not_found: "We could not find that rehearsal.",
  not_enabled: "Rehearsals are not available yet.",
  invalid: "Please check your answers and try again.",
  consent: "Turn on AI features to prepare a rehearsal.",
  failed: "Something went wrong. Please try again.",
};
