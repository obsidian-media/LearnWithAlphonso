/**
 * Irreversible or data-revealing account actions (deletion, the full data export) confirm the session with the auth
 * server instead of trusting the locally verified token alone. A token whose session was signed out, or whose user
 * was deleted, keeps a valid signature until it expires; the auth server refuses it at once.
 */
/** What a caller gets when the auth server could not be asked (not the same as the session having ended). */
export const SESSION_CHECK_UNAVAILABLE = "Session check unavailable. Try again shortly.";

export function isAuthServerOutage(error: { status?: number; name?: string }): boolean {
  if (error.name === "AuthRetryableFetchError") return true;
  const status = error.status;
  return typeof status !== "number" || status === 0 || status >= 500;
}

export async function requireLiveSession(
  accessToken: string | undefined,
  userId: string,
): Promise<void> {
  if (!accessToken) throw new Error("Unauthorized: No token provided");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let result: Awaited<ReturnType<typeof supabaseAdmin.auth.getUser>>;
  try {
    result = await supabaseAdmin.auth.getUser(accessToken);
  } catch {
    throw new Error(SESSION_CHECK_UNAVAILABLE);
  }
  const { data, error } = result;
  // The auth server answering "no" (a 4xx) means the session is over. Not answering (no status, a 5xx, a network
  // failure) says nothing about the session, so it must not read as a sign-out.
  if (error && isAuthServerOutage(error)) throw new Error(SESSION_CHECK_UNAVAILABLE);
  if (error || !data?.user || data.user.id !== userId) {
    throw new Error("Unauthorized: Session has ended");
  }
}
