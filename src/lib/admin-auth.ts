import type { SupabaseClient } from "@supabase/supabase-js";

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
