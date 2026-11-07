import { useSyncExternalStore } from "react";

/**
 * Whether the one-time public-name prompt is, or may be about to be, on screen. The AI consent sheet reads this
 * and waits its turn: two modal dialogs must never be open at once, and the name prompt (first sign-in) has
 * priority. NamePrompt reports "open" while its status is still loading, so a consent request made in that
 * moment cannot slip in front of it.
 */
let open = false;
const listeners = new Set<() => void>();

export function setNamePromptBlocking(value: boolean): void {
  if (open === value) return;
  open = value;
  for (const listener of listeners) listener();
}

export function useNamePromptBlocking(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
    () => false,
  );
}

/**
 * The first run's own screens (after sign-in, and Complete your profile) hold the name prompt back: it would cover
 * the screen the learner is answering. It asks as soon as they leave. Returns the release.
 */
let holds = 0;
const holdListeners = new Set<() => void>();
const notifyHolds = () => holdListeners.forEach((l) => l());

export function holdNamePrompt(): () => void {
  holds += 1;
  notifyHolds();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    notifyHolds();
  };
}

export function useNamePromptHeld(): boolean {
  return useSyncExternalStore(
    (listener) => {
      holdListeners.add(listener);
      return () => holdListeners.delete(listener);
    },
    () => holds > 0,
    () => false,
  );
}
