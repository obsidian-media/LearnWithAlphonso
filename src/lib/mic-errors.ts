/**
 * What to tell a learner when the microphone cannot open, by the error getUserMedia threw. One message per cause, each
 * saying what to do next, instead of one "Microphone access is needed" for every failure.
 */
export type MicProblem = "denied" | "missing" | "busy" | "unsupported" | "lost" | "other";

export const MIC_MESSAGES: Record<MicProblem, string> = {
  denied:
    "The microphone is blocked. Allow it for this site in your browser settings (on iPhone: Settings, Safari, Microphone, or the aA menu, Website Settings), then try again.",
  missing: "No microphone was found. Plug one in or check your device, then try again.",
  busy: "The microphone is being used by another app. Close it, then try again.",
  unsupported: "This microphone can't be used here. Try another one, or type your message instead.",
  lost: "The microphone stopped working. Check it is still connected, then try again.",
  other: "The microphone could not start. Try again, or type your message instead.",
};

function errorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    return String((error as { name?: unknown }).name);
  }
  return "";
}

/** The cause behind a getUserMedia error (by `error.name`). */
export function micProblemFor(error: unknown): MicProblem {
  switch (errorName(error)) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "missing";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "busy";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "unsupported";
    default:
      return "other";
  }
}

export function micErrorMessage(error: unknown): string {
  return MIC_MESSAGES[micProblemFor(error)];
}
