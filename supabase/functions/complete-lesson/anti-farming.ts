/**
 * Anti-farming that refuses only what no human can produce (owner decision, 2026-11-04). Deliberately NOT here: a
 * minimum lesson time (an easy or well-known lesson is legitimately quick) and a daily XP cap (leagues and
 * leaderboards reward people who keep playing).
 *
 * Constants, from production read-only on 2026-11-04 (60 completions, 6 users):
 *  - The busiest real rolling hour held 7 completions (p99 6.4). 60 is about 8x that.
 *
 * There is deliberately NO per-question speed floor. A client that has no session token yet (an offline queue item, a
 * re-mint after the 3 h expiry, a failed token fetch at open) mints one and completes at once, so the session's age
 * says nothing about how long the lesson took, and a script can mint tokens ahead and wait anyway.
 *
 * Keep HOURLY_COMPLETION_LIMIT equal to src/lib/anti-farming.ts (a test compares them).
 */
export const HOURLY_COMPLETION_LIMIT = 60;

/**
 * The instant a completion counts toward the hourly limit: its claimed time clamped into [session issued, now] (the
 * same bound the streak day uses), or now when there is no usable claim. Counting a queued replay at the time it was
 * played, not when it arrives, is what keeps a reconnect burst from being refused.
 */
export function completionInstantMs(
  completedAt: string | undefined,
  sessionIssuedAtMs: number | null,
  nowMs: number,
): number {
  if (!completedAt || sessionIssuedAtMs === null) return nowMs;
  const claimed = Date.parse(completedAt);
  if (!Number.isFinite(claimed) || !Number.isFinite(sessionIssuedAtMs) || sessionIssuedAtMs > nowMs)
    return nowMs;
  return Math.min(Math.max(claimed, sessionIssuedAtMs), nowMs);
}
