/**
 * The learner's last hands-free choice, remembered per device so every new call (Practice, campaigns, Hector)
 * starts the way they left it. Storage can be missing or throw (private windows, blocked site data), so every access
 * is wrapped: without it hands-free simply starts off, as before. The once-per-device safety note is separate
 * (`HANDS_FREE_NOTE_SEEN_KEY`) and is still required before the first time it is switched on.
 */
export const HANDS_FREE_PREFERENCE_KEY = "handsFree.preferred.v1";

export function readHandsFreePreference(): boolean {
  try {
    return window.localStorage.getItem(HANDS_FREE_PREFERENCE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Whether the learner has chosen on this device: "on", "off" (they switched it off), or "unset" (never chosen).
 * Hector calls start ON from "unset" once the safety note was confirmed; an explicit "off" is kept.
 */
export function readHandsFreeChoice(): "on" | "off" | "unset" {
  try {
    const v = window.localStorage.getItem(HANDS_FREE_PREFERENCE_KEY);
    return v === "1" ? "on" : v === "0" ? "off" : "unset";
  } catch {
    return "unset";
  }
}

export function writeHandsFreePreference(on: boolean): void {
  try {
    window.localStorage.setItem(HANDS_FREE_PREFERENCE_KEY, on ? "1" : "0");
  } catch {
    /* the choice is not remembered; nothing else depends on it */
  }
}
