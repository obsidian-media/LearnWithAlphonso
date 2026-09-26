/**
 * Hector re-parenting, Phase 0
 * (docs/superpowers/specs/2026-09-26-hector-reparenting-design.md):
 * revokes the Cloud Voice (Hector) account linked to this account, if
 * any, when the account is deleted. Hector's Cloud Voice backend lives
 * in a genuinely separate Supabase project owned by a different
 * codebase (AlphonsoEcosystem) -- this app has no admin access to it,
 * so revocation can only happen by asking that backend to do it.
 *
 * **The endpoint this calls does not exist yet.** This module specifies
 * the exact contract needed from AlphonsoEcosystem's Cloud Voice
 * backend (open question 1 in the design doc above) and calls it
 * exactly the way `apple-revocation.ts` calls Apple's -- config absent
 * (always true today) means revocation is skipped and recorded, never
 * silently assumed. The moment the endpoint exists and
 * HECTOR_VOICE_REVOKE_URL/HECTOR_VOICE_SHARED_SECRET are set, this
 * starts working with no further code change here.
 *
 * Contract needed from Cloud Voice's backend:
 *   POST {HECTOR_VOICE_REVOKE_URL}
 *   Authorization: Bearer {HECTOR_VOICE_SHARED_SECRET}
 *   Content-Type: application/json
 *   Body:    {"cloud_voice_user_id": "<uuid>"}
 *   Success: any 2xx status (body ignored)
 *   Failure: any non-2xx status -- this module treats it as "not
 *            revoked" and never throws, so the exact failure body
 *            format doesn't matter here
 *   Effect:  the named Cloud Voice account (and its device
 *            enrollment(s)) should be revoked/deleted, mirroring what
 *            `/v1/voice/devices/enroll` created
 */

export type HectorRevocationConfig = {
  revokeUrl: string;
  sharedSecret: string;
};

/**
 * Reads the two settings, or returns null when either is missing.
 *
 * Null is a first-class outcome, not an error -- this app must remain
 * deployable before AlphonsoEcosystem builds the endpoint above, and
 * account deletion must never be blocked by it (see `revokeHectorLink`).
 */
export function hectorRevocationConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): HectorRevocationConfig | null {
  const revokeUrl = env.HECTOR_VOICE_REVOKE_URL;
  const sharedSecret = env.HECTOR_VOICE_SHARED_SECRET;
  if (!revokeUrl || !sharedSecret) return null;
  return { revokeUrl, sharedSecret };
}

/**
 * Revokes the Cloud Voice account. Returns whether it happened.
 *
 * **This must never throw into a deletion flow.** A user's right to
 * delete their account cannot depend on a second product's endpoint
 * being reachable -- or existing at all yet -- so the caller proceeds
 * either way and records the outcome, same rule as `revokeAppleGrant`.
 */
export async function revokeHectorLink(
  config: HectorRevocationConfig,
  cloudVoiceUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(config.revokeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.sharedSecret}`,
      },
      body: JSON.stringify({ cloud_voice_user_id: cloudVoiceUserId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
