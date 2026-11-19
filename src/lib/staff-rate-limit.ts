import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Staff console rate limits, counted in the database (consume_staff_rate_limit, migration 20261125120000) so every
 * server instance shares one window. They are a brake on a staff account that runs away (a stuck script, a stolen
 * session), not a precise quota: fixed windows, and a refused call is not counted.
 *
 * Fails closed: if the database cannot be asked, the call is refused with RATE_LIMIT_UNAVAILABLE_MESSAGE. Staff are a
 * handful of people and every console call already needs this database, so an outage costs nothing extra; an open
 * failure would turn "break the limiter" into "remove the limit".
 */
export const RATE_LIMIT_UNAVAILABLE_MESSAGE =
  "Could not check the request limit. Try again shortly.";

export type StaffLimit = { bucket: string; max: number; windowSeconds: number };

/** The console's limits, one bucket each so a busy list does not use up another action's allowance. */
export const STAFF_LIMITS = {
  numbers: { bucket: "numbers", max: 30, windowSeconds: 60 },
  numbersRefresh: { bucket: "numbers_refresh", max: 6, windowSeconds: 60 },
  support_read: { bucket: "support_read", max: 120, windowSeconds: 60 },
  support_write: { bucket: "support_write", max: 60, windowSeconds: 60 },
  system_health: { bucket: "system_health", max: 30, windowSeconds: 60 },
  user_search: { bucket: "user_search", max: 30, windowSeconds: 60 },
} as const satisfies Record<string, StaffLimit>;

/** True when the call is allowed (and counted). Throws RATE_LIMIT_UNAVAILABLE_MESSAGE when the count cannot be made. */
export async function consumeStaffLimit(
  client: SupabaseClient,
  actor: string,
  limit: StaffLimit,
): Promise<boolean> {
  const { data, error } = await client.rpc("consume_staff_rate_limit", {
    p_actor: actor,
    p_bucket: limit.bucket,
    p_max: limit.max,
    p_window_seconds: limit.windowSeconds,
  } as never);
  if (error || typeof data !== "boolean") throw new Error(RATE_LIMIT_UNAVAILABLE_MESSAGE);
  return data;
}
