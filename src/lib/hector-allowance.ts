/**
 * The learner's daily Hector allowance (BACKLOG 0.0-bq #5), read before Hector greets so a learner who has used it
 * up sees the "out for today" message instead of one more cached greeting.
 *
 * There is no status endpoint and no new one is needed: `consume_ai_quota` keeps one `ai_usage` row per user, day
 * and kind, and the learner may read their own rows (RLS "ai_usage_select_own"). The day is the UTC date, because
 * the function keys on `current_date` on a UTC database. It refuses the call that would take the count past the
 * limit, so the allowance is used up once the count has reached it.
 *
 * Fails open: when the read fails the greeting plays as before, because the server still refuses the turn. Mirrored
 * on iOS (LearnWithAlphonsoKit/HectorAllowance.swift) and Android (core/logic/HectorAllowance.kt); keep the three
 * in step.
 */

/**
 * The limit is NOT a constant here. The server says it (GET /api/app-config, limits.hectorDaily, from DAILY_LIMITS in
 * ai-quota.server.ts, which must agree with consume_ai_quota); every client reads it from there, so a change is made
 * in one place. With no limit known the allowance is never "used up".
 */

/** The limit from an /api/app-config answer: a positive whole number, or null. */
export function hectorDailyLimitFrom(config: unknown): number | null {
  const limits = (config as { limits?: { hectorDaily?: unknown } } | null)?.limits;
  const n = limits?.hectorDaily;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : null;
}

/** Asks the server for the limit; any failure answers null (fail open). */
export async function fetchHectorDailyLimit(
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  try {
    const response = await fetchImpl("/api/app-config");
    if (!response.ok) return null;
    return hectorDailyLimitFrom(await response.json());
  } catch {
    return null;
  }
}

/** The words the server's own quota refusal shows (TutorError / AiErrorCopy carry the same). */
export const HECTOR_OUT_FOR_TODAY = "You've reached today's AI practice limit. Try again tomorrow.";

/** consume_ai_quota keys on the UTC date. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** True when today's rows show the allowance used up; a missing or malformed row never locks the learner out. */
export function hectorAllowanceUsedUp(
  rows: ReadonlyArray<{ count: number }> | null | undefined,
  limit: number | null | undefined,
): boolean {
  if (limit === null || limit === undefined) return false;
  return (rows ?? []).some((r) => typeof r.count === "number" && r.count >= limit);
}

type UsageReader = {
  from: (table: "ai_usage") => {
    select: (cols: string) => {
      eq: (
        col: string,
        v: string,
      ) => { eq: (col: string, v: string) => PromiseLike<{ data: unknown }> };
    };
  };
};

/** Reads today's Hector usage with the learner's own session; any failure answers false (fail open). */
export async function isHectorAllowanceUsedUp(
  client: unknown,
  now: Date = new Date(),
  limit?: number | null,
): Promise<boolean> {
  try {
    // No limit from the server: nothing to compare against, so do not even read the usage row.
    if (limit === null || limit === undefined) limit = await fetchHectorDailyLimit();
    if (limit === null) return false;
    const { data } = await (client as UsageReader)
      .from("ai_usage")
      .select("count")
      .eq("day", utcDay(now))
      .eq("kind", "hector");
    return hectorAllowanceUsedUp(Array.isArray(data) ? (data as { count: number }[]) : null, limit);
  } catch {
    return false;
  }
}
