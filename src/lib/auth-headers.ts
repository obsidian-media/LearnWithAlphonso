import { supabase } from "@/integrations/supabase/client";

/** Bearer header for calls to /api/* routes that require a signed-in user. */
export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
