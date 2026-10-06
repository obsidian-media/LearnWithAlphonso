import { supabase } from "@/integrations/supabase/client";

/** The signed-in user's id, or null when signed out. Used to key per-user local caches. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Bearer header for calls to /api/* routes that require a signed-in user. */
export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
