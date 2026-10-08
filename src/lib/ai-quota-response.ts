/**
 * Every AI quota rejection reaches clients as
 * 429 { error: "quota-exceeded", resetsAt, message }. `error` is the stable
 * code clients branch on (the iOS TutorError.quotaExceeded, web quota copy);
 * `message` keeps the human text for clients that display it as-is.
 * Pure (no Supabase import) so route tests that mock ai-quota.server keep
 * the real response shaping.
 */
export type QuotaFailure = { status: number; message: string; resetsAt?: string };

/** consume_ai_quota keys on current_date, and the database runs in UTC. */
export function nextUtcMidnight(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  ).toISOString();
}

/** consume_ai_rate_limit buckets by date_trunc('minute', now()). */
export function nextMinute(now: Date): string {
  const start = Math.floor(now.getTime() / 60_000) * 60_000;
  return new Date(start + 60_000).toISOString();
}

export function quotaFailureResponse(failure: QuotaFailure): Response {
  if (failure.status === 429) {
    return Response.json(
      { error: "quota-exceeded", resetsAt: failure.resetsAt ?? null, message: failure.message },
      { status: 429 },
    );
  }
  return Response.json({ error: failure.message }, { status: failure.status });
}
