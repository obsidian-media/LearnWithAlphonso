/**
 * Web copy of supabase/functions/complete-lesson/anti-farming.ts (the Edge Function bundles itself and cannot import
 * from src). It refuses only what no human can produce (no speed floor, see that file); see it for the production numbers. src/lib/anti-farming.test.ts fails when the two copies disagree.
 */
export const HOURLY_COMPLETION_LIMIT = 60;

/** The stable code complete-lesson answers with (HTTP 429) and the web server function throws as its message. */
export const COMPLETION_REFUSED_CODES = ["rate-limited"] as const;
export type CompletionRefusedCode = (typeof COMPLETION_REFUSED_CODES)[number];

/** Calm copy for the refusal. The native clients instead queue it and say it will sync. */
export const SLOW_DOWN_MESSAGE = "Slow down a little and try again.";

/** True when a failed completion was a machine-speed refusal rather than a save failure. */
export function isCompletionRefusal(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (COMPLETION_REFUSED_CODES as readonly string[]).includes(message);
}
