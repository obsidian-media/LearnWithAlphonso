// A banned learner's still-valid access token must stop working at once (staff console, 20261113100000). Every
// learner-facing Edge Function asks this after it has validated the token. Kept in step with
// ACCOUNT_SUSPENDED_MESSAGE in src/integrations/supabase/auth-middleware.ts; the apps recognise the string.
export const ACCOUNT_SUSPENDED_ERROR = "account_suspended";

export type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** True only for a confirmed active ban. A failed check is logged and is NOT a ban: an outage must not lock everyone out. */
export async function isBanned(admin: RpcClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("is_restricted", { p_user: userId, p_kind: "ban" });
  if (error) {
    console.error("[account-status] could not check the account status");
    return false;
  }
  return data === true;
}

export function suspendedResponse(): Response {
  return new Response(JSON.stringify({ error: ACCOUNT_SUSPENDED_ERROR }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

/** The 403 to return for a banned learner, or null. `admin` is the service-role client the function already builds. */
export async function suspendedResponseIfBanned(admin: RpcClient, userId: string): Promise<Response | null> {
  try {
    return (await isBanned(admin, userId)) ? suspendedResponse() : null;
  } catch {
    // A client that cannot even ask is an outage, not a ban.
    console.error("[account-status] could not check the account status");
    return null;
  }
}
