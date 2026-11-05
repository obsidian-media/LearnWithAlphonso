/**
 * Irreversible or data-revealing account actions (deletion, the full data export) confirm the session with the auth
 * server instead of trusting the locally verified token alone. A token whose session was signed out, or whose user
 * was deleted, keeps a valid signature until it expires; the auth server refuses it at once.
 */
export async function requireLiveSession(accessToken: string | undefined, userId: string): Promise<void> {
  if (!accessToken) throw new Error("Unauthorized: No token provided");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data?.user || data.user.id !== userId) {
    throw new Error("Unauthorized: Session has ended");
  }
}
