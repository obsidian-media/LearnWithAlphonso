/**
 * Hector re-parenting Phase 1
 * (docs/superpowers/specs/2026-09-26-hector-reparenting-design.md):
 * silently provisions (or reuses) a Cloud Voice "shadow" account for a
 * Pro subscriber, so Hector can be unlocked purely by entitlement --
 * no second sign-in prompt. The caller
 * (`src/routes/api/hector-shadow-account.ts`) is what actually gates
 * this on a real, server-verified Pro check
 * (`revenuecat-entitlement.ts`) before ever calling this module -- this
 * file is only the AlphonsoEcosystem integration itself.
 *
 * **The endpoint this calls does not exist yet.** Same posture as
 * `hector-revocation.ts`: this specifies the exact contract needed from
 * AlphonsoEcosystem's Cloud Voice backend and calls it config-gated --
 * null config (always true today) means "not configured", reported
 * honestly, never faked as success. The moment the endpoint exists and
 * HECTOR_VOICE_LINK_ACCOUNT_URL/HECTOR_VOICE_SHARED_SECRET are set,
 * this starts working with no further code change here. (Same shared
 * secret env var Phase 0's hector-revocation.ts uses -- one secret
 * authorizes this app's backend to both endpoints on Cloud Voice's
 * side, not two.)
 *
 * Contract needed from Cloud Voice's backend:
 *   POST {HECTOR_VOICE_LINK_ACCOUNT_URL}
 *   Authorization: Bearer {HECTOR_VOICE_SHARED_SECRET}
 *   Content-Type: application/json
 *   Body:    {"main_app_user_id": "<this app's Supabase user id>"}
 *   Success: 200 {"cloud_voice_user_id": "<uuid>",
 *                 "access_token": "<GoTrue access token>",
 *                 "refresh_token": "<GoTrue refresh token>"}
 *            -- looks up or creates a Cloud Voice auth.users row tagged
 *            with `main_app_user_id` in app_metadata (idempotent: the
 *            same main_app_user_id must always resolve to the same
 *            Cloud Voice account), enrolls the device implicitly or
 *            leaves enrollment to a follow-up
 *            `/v1/voice/devices/enroll` call with the returned
 *            access_token (either is fine -- caller does not assume
 *            which), and mints a session for it.
 *   Failure: any non-2xx status -- treated as "not available", never
 *            thrown
 */

export type HectorShadowAccountConfig = {
  linkAccountUrl: string;
  sharedSecret: string;
};

export function hectorShadowAccountConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): HectorShadowAccountConfig | null {
  const linkAccountUrl = env.HECTOR_VOICE_LINK_ACCOUNT_URL;
  const sharedSecret = env.HECTOR_VOICE_SHARED_SECRET;
  if (!linkAccountUrl || !sharedSecret) return null;
  return { linkAccountUrl, sharedSecret };
}

export type ShadowAccountSession = {
  cloudVoiceUserId: string;
  accessToken: string;
  refreshToken: string;
};

/**
 * Provisions or reuses the shadow account. Returns null for every
 * "could not" -- not configured (true today), or Cloud Voice refused --
 * never throws. The caller (the API route) is responsible for having
 * already confirmed the caller is a Pro subscriber; this module does
 * not re-check that.
 */
export async function provisionShadowAccount(
  config: HectorShadowAccountConfig,
  mainAppUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ShadowAccountSession | null> {
  try {
    const res = await fetchImpl(config.linkAccountUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.sharedSecret}`,
      },
      body: JSON.stringify({ main_app_user_id: mainAppUserId }),
    });
    if (!res.ok) return null;

    const body = (await res.json()) as {
      cloud_voice_user_id?: string;
      access_token?: string;
      refresh_token?: string;
    };
    if (!body.cloud_voice_user_id || !body.access_token || !body.refresh_token) return null;

    return {
      cloudVoiceUserId: body.cloud_voice_user_id,
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
    };
  } catch {
    return null;
  }
}
