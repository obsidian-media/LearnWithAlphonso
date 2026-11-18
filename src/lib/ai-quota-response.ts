import { noStoreJson } from "@/lib/api-json";
/**
 * Every AI quota rejection reaches clients as
 * 429 { error: "quota-exceeded", resetsAt, message }. `error` is the stable
 * code clients branch on (the iOS TutorError.quotaExceeded, web quota copy);
 * `message` keeps the human text for clients that display it as-is.
 * Pure (no Supabase import) so route tests that mock ai-quota.server keep
 * the real response shaping.
 */
export type QuotaFailure = {
  status: number;
  message: string;
  resetsAt?: string;
  reason?: "monthly-cap";
};

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
    return noStoreJson(
      {
        error: "quota-exceeded",
        resetsAt: failure.resetsAt ?? null,
        message: failure.message,
        // Only present for the monthly cost cap; the clients' copy keys off how far away the reset is.
        ...(failure.reason ? { reason: failure.reason } : {}),
      },
      { status: 429 },
    );
  }
  return noStoreJson({ error: failure.message }, { status: failure.status });
}
