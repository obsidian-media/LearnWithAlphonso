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

export function writeHandsFreePreference(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(HANDS_FREE_PREFERENCE_KEY, "1");
    else window.localStorage.removeItem(HANDS_FREE_PREFERENCE_KEY);
  } catch {
    /* the choice is not remembered; nothing else depends on it */
  }
}
