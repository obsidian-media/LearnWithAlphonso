import { createSign } from "node:crypto";

/**
 * Apple's Sign in with Apple token revocation.
 *
 * Apple requires an app that offers Sign in with Apple to revoke the user's
 * tokens when they delete their account -- it is not optional, and it is
 * checked. https://developer.apple.com/documentation/sign_in_with_apple/revoke_tokens
 *
 * **Why this is server-side and not in the app.** Revocation authenticates
 * with a `client_secret` that is an ES256 JWT signed by the team's private
 * `.p8` key. That key cannot ship in a binary: anyone extracting it could
 * mint Apple credentials for this app. So the app forwards the
 * authorization code once, at sign-in, and everything else happens here.
 *
 * **Why we store a refresh token rather than the authorization code.** The
 * code is single-use and expires in five minutes, and the app's in-memory
 * copy does not survive relaunch -- so "sign in with Apple, quit, come
 * back tomorrow, delete account" would have nothing to revoke with. We
 * exchange the code for a refresh token at sign-in and revoke that later.
 * Revoking a refresh token invalidates the whole grant, which is what
 * Apple asks for.
 *
 * Configuration (all four required; absent means revocation is skipped and
 * recorded, never silently assumed):
 *   APPLE_TEAM_ID     -- 10-character Apple Developer team id
 *   APPLE_KEY_ID      -- 10-character key id for the .p8
 *   APPLE_PRIVATE_KEY -- the .p8 contents, PEM, newlines may be \n-escaped
 *   APPLE_CLIENT_ID   -- the bundle id for native sign-in
 *                        (com.obsidianmedia.learnwithalphonso)
 */

const APPLE_AUTH_HOST = "https://appleid.apple.com";
/** Apple's documented ceiling for a client secret is 6 months; stay well under. */
const CLIENT_SECRET_TTL_SECONDS = 60 * 30;

export type AppleConfig = {
  teamId: string;
  keyId: string;
  privateKey: string;
  clientId: string;
};

/**
 * Reads the four settings, or returns null when any is missing.
 *
 * Null is a first-class outcome, not an error: the app must remain
 * deployable before these secrets exist, and account deletion must never
 * be blocked by them (see `revokeAppleGrant`).
 */
export function appleConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AppleConfig | null {
  const teamId = env.APPLE_TEAM_ID;
  const keyId = env.APPLE_KEY_ID;
  const privateKey = env.APPLE_PRIVATE_KEY;
  const clientId = env.APPLE_CLIENT_ID;
  if (!teamId || !keyId || !privateKey || !clientId) return null;
  // Secrets stores routinely flatten the PEM's newlines; restore them or
  // the key fails to parse with a message that does not say why.
  return { teamId, keyId, privateKey: privateKey.replace(/\\n/g, "\n"), clientId };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Builds the ES256 `client_secret` JWT Apple requires.
 *
 * Signed with Node's own crypto rather than a JWT library, which would be a
 * dependency for one function. The detail that matters is
 * `dsaEncoding: "ieee-p1363"`: Node defaults to DER, and JOSE requires the
 * raw r||s pair. A DER signature here produces `invalid_client` from Apple
 * with no indication that the encoding is the problem.
 */
export function buildClientSecret(
  config: AppleConfig,
  now = Math.floor(Date.now() / 1000),
): string {
  const header = { alg: "ES256", kid: config.keyId, typ: "JWT" };
  const payload = {
    iss: config.teamId,
    iat: now,
    exp: now + CLIENT_SECRET_TTL_SECONDS,
    aud: APPLE_AUTH_HOST,
    sub: config.clientId,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign("SHA256")
    .update(signingInput)
    .sign({ key: config.privateKey, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Trades the app's one-time authorization code for a refresh token.
 *
 * Returns null when Apple rejects the exchange. A failure here is not worth
 * failing sign-in over -- the user is already authenticated by the identity
 * token -- but it does mean we will have nothing to revoke later, so the
 * caller records it.
 */
export async function exchangeAuthorizationCode(
  config: AppleConfig,
  authorizationCode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const res = await fetchImpl(`${APPLE_AUTH_HOST}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: buildClientSecret(config),
      code: authorizationCode,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { refresh_token?: string };
  return body.refresh_token ?? null;
}

/**
 * Revokes the grant. Returns whether Apple accepted it.
 *
 * **This must never throw into a deletion flow.** A user's right to delete
 * their account cannot depend on a third party being reachable, so the
 * caller proceeds either way and records the outcome -- an unrevoked grant
 * is a compliance problem to chase, not a reason to refuse someone their
 * data deletion.
 */
export async function revokeAppleGrant(
  config: AppleConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${APPLE_AUTH_HOST}/auth/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: buildClientSecret(config),
        token: refreshToken,
        token_type_hint: "refresh_token",
      }),
    });
    // Apple answers 200 with an empty body on success.
    return res.ok;
  } catch {
    return false;
  }
}
