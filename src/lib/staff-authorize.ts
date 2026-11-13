import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getStaffRole,
  meetsAdminAssurance,
  SECOND_FACTOR_REQUIRED_MESSAGE,
  UNAUTHORIZED_MESSAGE,
} from "./admin-auth";
import { effectiveScopes, hasScope, type Scope, type StaffRole } from "./staff-scopes";

/**
 * The authorization decision behind requireStaff, without the framework so it can be tested directly.
 *
 * Order matters and mirrors requireAdmin: staff row (a non-staff or disabled caller gets exactly
 * UNAUTHORIZED_MESSAGE, indistinguishable from a bad token), then the second factor (only staff ever learn it is
 * missing), then the scope (a distinct "Forbidden" only for an authenticated staff member who lacks it).
 * `scope` is optional: omitted means "any active staff member" (the who-am-I call that drives the navigation).
 */
export async function authorizeStaff(input: {
  client: SupabaseClient;
  userId: string;
  claims: { aal?: unknown } | undefined;
  scope?: Scope;
  requireAal2?: string;
}): Promise<{ staffRole: StaffRole; staffScopes: Scope[] }> {
  const staff = await getStaffRole(input.client, input.userId);
  if (!staff) throw new Error(UNAUTHORIZED_MESSAGE);
  if (!meetsAdminAssurance(input.claims, input.requireAal2)) {
    throw new Error(SECOND_FACTOR_REQUIRED_MESSAGE);
  }
  if (input.scope && !hasScope(staff.role, staff.scopes, input.scope)) {
    throw new Error(`Forbidden: missing scope ${input.scope}`);
  }
  return { staffRole: staff.role, staffScopes: effectiveScopes(staff.role, staff.scopes) };
}
