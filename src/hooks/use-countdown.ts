import { useEffect, useState } from "react";

/** Formats a duration as "M:SS", floored to the nearest second. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Live "M:SS" countdown to a target timestamp (ms since epoch), ticking
 * every second. Returns null once the target has passed or isn't set.
 */
export function useCountdown(targetMs: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (targetMs === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetMs]);

  if (targetMs === null) return null;
  const remaining = targetMs - now;
  if (remaining <= 0) return null;
  return formatDuration(remaining);
}
