/**
 * The ban check for the web API routes that cost money per call. A banned learner's access token stays valid until it
 * expires, so the database is asked (public.is_restricted, kind 'ban'), the same check requireSupabaseAuth and the
 * Edge Functions make.
 *
 * It uses the SERVICE-ROLE client: signed-in users are not allowed to execute is_restricted (20261113100100 grants it
 * to the server only), so asking with the learner's own client fails for everyone.
 *
 * A failed check is refused with a 503 rather than let through: these routes cost real money per call, a ban exists
 * to stop exactly that, and a retry a moment later costs the learner nothing.
 */
export const ACCOUNT_SUSPENDED_ERROR = "account_suspended";
export const ACCOUNT_CHECK_UNAVAILABLE = "Could not verify your account. Try again shortly.";

export type BanDenial = { status: 403 | 503; message: string };
type BanRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** null = go ahead. `admin` is injectable for tests; production imports the service-role client lazily. */
export async function checkBan(userId: string, admin?: BanRpc): Promise<BanDenial | null> {
  try {
    const client =
      admin ??
      ((await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as BanRpc);
    const { data, error } = await client.rpc("is_restricted", { p_user: userId, p_kind: "ban" });
    if (error) throw new Error("check failed");
    return data === true ? { status: 403, message: ACCOUNT_SUSPENDED_ERROR } : null;
  } catch {
    console.error("[auth] could not check the account status");
    return { status: 503, message: ACCOUNT_CHECK_UNAVAILABLE };
  }
}
