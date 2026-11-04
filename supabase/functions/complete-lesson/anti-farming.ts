/**
 * Anti-farming that refuses only what no human can produce (owner decision, 2026-11-04). Deliberately NOT here: a
 * minimum lesson time (an easy or well-known lesson is legitimately quick) and a daily XP cap (leagues and
 * leaderboards reward people who keep playing).
 *
 * Constants, from production read-only on 2026-11-04 (60 completions, 6 users):
 *  - Between two consecutive lessons of one user, the shortest real gap was 136 s (27 s per question, p10 171 s,
 *    32.7 s per question). That gap includes time between lessons, so it overstates lesson length, but the floor
 *    below is still about 70x under it. Gaps under 1 s in the table are seeded/QA rows, not people.
 *  - The busiest real rolling hour held 7 completions (p99 6.4). 60 is about 8x that.
 *
 * Keep MIN_SECONDS_PER_QUESTION and HOURLY_COMPLETION_LIMIT equal to src/lib/anti-farming.ts (a test compares them).
 */
export const MIN_SECONDS_PER_QUESTION = 0.4;
export const HOURLY_COMPLETION_LIMIT = 60;

/** True when the server-issued session is younger than the fastest possible answering of `questionCount` questions. */
export function completedTooFast(
  sessionIssuedAtMs: number,
  nowMs: number,
  questionCount: number,
): boolean {
  if (!Number.isFinite(sessionIssuedAtMs) || !Number.isFinite(nowMs) || questionCount < 1)
    return false;
  return nowMs - sessionIssuedAtMs < MIN_SECONDS_PER_QUESTION * 1000 * questionCount;
}

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
