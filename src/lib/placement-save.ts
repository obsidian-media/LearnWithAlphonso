/**
 * Saving a placement result, awaited. The result screen used to fire the save and forget it (`.catch(() => {})`): when
 * the call failed (offline, a dropped connection) the screen still said "Your level: B1" while the server stayed at
 * A1, and the learner never found out. Now the save is tried a bounded number of times and the caller learns whether
 * it landed, so the screen can say "couldn't save, try again".
 */

/** Tries in all, the first included. */
export const PLACEMENT_SAVE_ATTEMPTS = 3;
/** Waits before the second and third tries, in ms. */
export const PLACEMENT_SAVE_DELAYS_MS = [600, 1800] as const;

export type PlacementSaveOptions = {
  attempts?: number;
  delaysMs?: readonly number[];
  /** Replaceable so a test does not wait. */
  sleep?: (ms: number) => Promise<void>;
};

/** True when one of the tries succeeded; false after the last one failed. Never throws. */
export async function savePlacementWithRetry(
  save: () => Promise<unknown>,
  options: PlacementSaveOptions = {},
): Promise<boolean> {
  const attempts = Math.max(1, options.attempts ?? PLACEMENT_SAVE_ATTEMPTS);
  const delays = options.delaysMs ?? PLACEMENT_SAVE_DELAYS_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await save();
      return true;
    } catch {
      if (attempt === attempts - 1) return false;
      await sleep(delays[Math.min(attempt, delays.length - 1)] ?? 0);
    }
  }
  return false;
}
