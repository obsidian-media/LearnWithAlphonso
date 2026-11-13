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

/** Pro learners' Hector turns per day; the real cap is in consume_ai_quota (20261102120000). */
export const HECTOR_DAILY_LIMIT = 150;

/** The words the server's own quota refusal shows (TutorError / AiErrorCopy carry the same). */
export const HECTOR_OUT_FOR_TODAY = "You've reached today's AI practice limit. Try again tomorrow.";

/** consume_ai_quota keys on the UTC date. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** True when today's rows show the allowance used up; a missing or malformed row never locks the learner out. */
export function hectorAllowanceUsedUp(
  rows: ReadonlyArray<{ count: number }> | null | undefined,
  limit: number = HECTOR_DAILY_LIMIT,
): boolean {
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
): Promise<boolean> {
  try {
    const { data } = await (client as UsageReader)
      .from("ai_usage")
      .select("count")
      .eq("day", utcDay(now))
      .eq("kind", "hector");
    return hectorAllowanceUsedUp(Array.isArray(data) ? (data as { count: number }[]) : null);
  } catch {
    return false;
  }
}
