import { useSyncExternalStore } from "react";

/**
 * Which layout the signed-in web app draws at this width (the owner's pick, "Option A: sidebar app").
 *
 *  - phone   under 768px: the phone layout, exactly as it always was (a 430px column, the tab bar at the bottom).
 *  - tablet  768 to 1023: an icon rail and one wide column, the stats as a strip at the top.
 *  - compact 1024 to 1279: an icon rail, the main column and a 280px panel.
 *  - wide    1280 and up: a labelled rail, a 720px main column and a 336px panel, centred.
 *
 * The breakpoints mirror Tailwind's `md` (768), `lg` (1024) and `xl` (1280), so a `md:` class and this hook agree.
 * Where there is no window or no matchMedia (the server, a bare test), the answer is "phone": nothing desktop mounts.
 */
export type ViewportTier = "phone" | "tablet" | "compact" | "wide";

export const TABLET_MIN = 768;
export const COMPACT_MIN = 1024;
export const WIDE_MIN = 1280;

const QUERIES = [
  `(min-width: ${WIDE_MIN}px)`,
  `(min-width: ${COMPACT_MIN}px)`,
  `(min-width: ${TABLET_MIN}px)`,
] as const;

function canMatch(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function tierSnapshot(): ViewportTier {
  if (!canMatch()) return "phone";
  const [wide, compact, tablet] = QUERIES.map((q) => window.matchMedia(q).matches);
  if (wide) return "wide";
  if (compact) return "compact";
  if (tablet) return "tablet";
  return "phone";
}

function subscribe(onChange: () => void): () => void {
  if (!canMatch()) return () => {};
  const lists = QUERIES.map((q) => window.matchMedia(q));
  for (const l of lists) l.addEventListener("change", onChange);
  return () => {
    for (const l of lists) l.removeEventListener("change", onChange);
  };
}

export function useViewportTier(): ViewportTier {
  return useSyncExternalStore(subscribe, tierSnapshot, () => "phone");
}

/** True from 768 up: the rail replaces the tab bar. */
export const hasRail = (tier: ViewportTier): boolean => tier !== "phone";
/** True from 1024 up: the right panel is on screen. */
export const hasPanel = (tier: ViewportTier): boolean => tier === "compact" || tier === "wide";
