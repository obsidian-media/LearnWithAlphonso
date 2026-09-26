/**
 * Verifies a Cloud Voice (Hector) access token against Cloud Voice's own
 * Supabase project, deriving the real `cloud_voice_user_id` server-side.
 *
 * **Why this exists.** `/api/hector-link` used to accept
 * `cloudVoiceUserId` straight from the request body, validated for UUID
 * shape only -- nothing proved the caller controlled that Cloud Voice
 * account. An attacker who knew a victim's Cloud Voice uuid could post
 * it first (the UNIQUE on `cloud_voice_user_id` only protects an
 * already-linked account, not this one), silently breaking the victim's
 * own future link. Cloud Voice's own backend already treats a bearer
 * token as the only proof of identity
 * (`AlphonsoEcosystem/voice/cloud-backend/app/supabase_auth.py`'s
 * `SupabaseDeviceRegistry.user_from_authorization` calls
 * `{cloud voice supabase_url}/auth/v1/user` -- GoTrue verifying the JWT
 * against that project's own signing key, which a token minted by this
 * app's own Supabase project cannot forge). This module makes
 * `/api/hector-link` do the same: derive the id from a verified token,
 * never accept it as a claim.
 *
 * Cloud Voice's URL and publishable key are not secrets -- Supabase's
 * own docs say publishable/anon keys are safe to embed in a client, and
 * `AppConfig.swift` already ships them to every device -- so "config"
 * here means "not yet wired server-side," not "a secret this needs."
 * Fail-closed still applies: a missing or misconfigured value must never
 * fall back to trusting the client's claimed id (see
 * `resolveCloudVoiceUserId`'s own doc comment).
 */

export type CloudVoiceAuthConfig = {
  supabaseUrl: string;
  publishableKey: string;
};

/**
 * Reads the two settings, or returns null when either is missing.
 *
 * Null is a first-class outcome, not an error -- same posture as this
 * codebase's other config-gated integrations (Apple revocation, Hector
 * revocation, RevenueCat). Callers MUST fail closed to "not linked" when
 * this is null, never fall back to trusting a client-supplied id.
 */
export function cloudVoiceAuthConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CloudVoiceAuthConfig | null {
  const supabaseUrl = env.HECTOR_VOICE_SUPABASE_URL;
  const publishableKey = env.HECTOR_VOICE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) return null;
  return { supabaseUrl, publishableKey };
}

/**
 * Returns the Cloud Voice user id `cloudVoiceAccessToken` actually
 * belongs to, verified against Cloud Voice's own Supabase project, or
 * null when that can't be confirmed -- an invalid or expired token,
 * Cloud Voice unreachable, or a malformed response. Never throws.
 *
 * **The caller MUST treat null as "not linked."** This is an
 * authorization check, not a storage lookup: unlike this codebase's
 * other soft-failure integrations (where "we couldn't tell" safely
 * degrades to skipping an optional side effect), falling back to a
 * client-supplied id here is exactly the defect this module fixes.
 */
export async function resolveCloudVoiceUserId(
  config: CloudVoiceAuthConfig,
  cloudVoiceAccessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchImpl(`${config.supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${cloudVoiceAccessToken}`,
        apikey: config.publishableKey,
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: string };
    return body.id ?? null;
  } catch {
    return null;
  }
}
