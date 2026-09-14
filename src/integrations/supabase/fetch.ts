/**
 * Shared by every hand-written Supabase client bootstrap in this app.
 *
 * NOT reused by client.ts, client.server.ts, or auth-middleware.ts even
 * though they duplicate this exact logic -- those three carry a "This file
 * is automatically generated. Do not edit it directly." banner from the
 * Lovable Supabase connection tool, and restructuring their imports would
 * just get silently reverted (or worse, half-reverted) the next time that
 * tool regenerates them. Consolidating this one non-generated caller
 * (ai-quota.server.ts) is the safe subset of that cleanup.
 */

export function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

export function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}
