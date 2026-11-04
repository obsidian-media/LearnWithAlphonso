/**
 * Web copy of supabase/functions/complete-lesson/anti-farming.ts (the Edge Function bundles itself and cannot import
 * from src). It refuses only what no human can produce; see that file for the production numbers the constants rest
 * on. src/lib/anti-farming.test.ts fails when the two copies disagree.
 */
export const MIN_SECONDS_PER_QUESTION = 0.4;
export const HOURLY_COMPLETION_LIMIT = 60;

/** The stable codes complete-lesson answers with (HTTP 429) and the web server function throws as its message. */
export const COMPLETION_REFUSED_CODES = ["too-fast", "rate-limited"] as const;
export type CompletionRefusedCode = (typeof COMPLETION_REFUSED_CODES)[number];

/** Calm copy for either refusal. The iOS and Android copies say the same words. */
export const SLOW_DOWN_MESSAGE = "Slow down a little and try again.";

export function completedTooFast(
  sessionIssuedAtMs: number,
  nowMs: number,
  questionCount: number,
): boolean {
  if (!Number.isFinite(sessionIssuedAtMs) || !Number.isFinite(nowMs) || questionCount < 1) {
    return false;
  }
  return nowMs - sessionIssuedAtMs < MIN_SECONDS_PER_QUESTION * 1000 * questionCount;
}

/** True when a failed completion was a machine-speed refusal rather than a save failure. */
export function isCompletionRefusal(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (COMPLETION_REFUSED_CODES as readonly string[]).includes(message);
}
