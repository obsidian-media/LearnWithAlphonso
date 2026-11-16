import { useSyncExternalStore } from "react";

/** Whether the page is in the Royal night look: src/lib/theme.ts applyLook sets data-ds-mode="night" only then. */
export function isNightRoot(root: { dataset: DOMStringMap } | undefined): boolean {
  return root?.dataset.dsMode === "night";
}

function subscribe(onChange: () => void): () => void {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-ds-mode", "data-palette"],
  });
  return () => observer.disconnect();
}

/** True in Royal night; false in Royal light and in Meadow (which stays light in a dark device). */
export function useNight(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isNightRoot(typeof document === "undefined" ? undefined : document.documentElement),
    () => false,
  );
}
