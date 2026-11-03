import { useState } from "react";

/**
 * True when the viewer asked for reduced motion. Read once on mount from matchMedia, so the first render already
 * shows the still version (no confetti, final numbers). False where matchMedia is missing.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduce] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  return reduce;
}
