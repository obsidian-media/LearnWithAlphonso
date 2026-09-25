import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * What requireAdmin throws when the caller is not on the allowlist.
 *
 * Copied VERBATIM from one of requireSupabaseAuth's own failures
 * (src/integrations/supabase/auth-middleware.ts). That is the entire
 * point: every message there is suffixed -- "Unauthorized: Invalid
 * token", "Unauthorized: No authorization header provided" -- so a bare
 * "Unauthorized" would be a string no bad token can produce, telling an
 * attacker with a valid learner token both that the endpoint exists and
 * that their token was otherwise fine.
 *
 * Endpoint existence still leaks through the HTTP status a framework
 * assigns a thrown error, so the property this buys is narrower than
 * "reveals nothing": it is "a non-admin cannot be distinguished from a
 * bad token". That is the achievable one, and it is worth having.
 *
 * A test asserts this string appears in auth-middleware.ts, so the two
 * cannot drift apart silently.
 */
export const UNAUTHORIZED_MESSAGE = "Unauthorized: Invalid token";

/**
 * The one authorization decision in the admin subsystem.
 *
 * MUST be called with a service-role client: `admin_users` has RLS
 * enabled and no policies (see
 * supabase/migrations/20260928010000_admin_users.sql), so a user's own
 * token reads nothing from it and this would return false for a real
 * admin. That is not a bug to work around by loosening the table -- the
 * unreadability is the security property.
 *
 * Fails closed on every uncertainty: absent row, query error, empty
 * subject. An admin check that answers "yes" when it does not know is
 * not a check.
 *
 * Filters on `user_id` and nothing else. An allowlist keyed on an email
 * or any other claim would depend on something a user can change about
 * themselves; the id comes from a validated token and cannot be.
 */
export async function isAdminUser(client: SupabaseClient, userId: string): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await client
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return false;
  return data != null;
}
