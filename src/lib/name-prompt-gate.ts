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
