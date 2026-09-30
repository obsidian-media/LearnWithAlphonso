// Firebase Cloud Messaging HTTP v1 sender for Android device tokens -- the
// Android counterpart of apns.ts, sharing its contract exactly: gracefully
// no-ops when the FCM secrets aren't configured, best-effort per device,
// and a dead token (FCM answering with the UNREGISTERED error code) is
// reported back so the caller prunes that device_tokens row.
//
// Requires (Edge Function secrets -- `supabase secrets set ...`):
//   FCM_SERVICE_ACCOUNT_JSON - the whole service-account JSON from the
//                              Firebase console (Project settings ->
//                              Service accounts -> Generate new private key).
//   FCM_PROJECT_ID           - the Firebase project id (General tab).
//
// The service account signs a short-lived RS256 JWT which Google exchanges
// for an OAuth access token scoped to firebase.messaging; that token is what
// the messages:send endpoint accepts. No Firebase Admin SDK: Deno's
// WebCrypto can sign RS256 directly and the dependency list stays as it is.

export type FcmServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type FcmDeps = {
  fetch: typeof fetch;
  now: () => number;
};

const defaultDeps: FcmDeps = { fetch: (...args) => fetch(...args), now: () => Date.now() };

// Every Google call is bounded: sendPushToUser awaits FCM before APNs, so a
// stalled exchange or send would otherwise hold up iOS delivery too (review
// on PR #192). Rejection on timeout lands in the same catch paths as any
// other failure: nothing sent, nothing pruned.
const REQUEST_TIMEOUT_MS = 10_000;

export function fcmConfigured(): boolean {
  return !!(Deno.env.get("FCM_SERVICE_ACCOUNT_JSON") && Deno.env.get("FCM_PROJECT_ID"));
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlText(text: string): string {
  return base64url(new TextEncoder().encode(text));
}

async function importRsaKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * Signs the service-account JWT and exchanges it at `token_uri` for an OAuth
 * access token. Exported with injectable deps so the test can check the
 * claims and the exchange request without Google.
 */
export async function buildFcmAccessToken(
  account: FcmServiceAccount,
  deps: FcmDeps = defaultDeps,
): Promise<string> {
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const iat = Math.floor(deps.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: tokenUri,
    iat,
    exp: iat + 3600,
  };
  const signingInput = `${base64urlText(JSON.stringify(header))}.${base64urlText(JSON.stringify(claims))}`;
  const key = await importRsaKey(account.private_key);
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${base64url(new Uint8Array(signature))}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const res = await deps.fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`fcm: token exchange failed with ${res.status}`);
  const json = await res.json() as { access_token?: string };
  if (!json.access_token) throw new Error("fcm: token exchange returned no access_token");
  return json.access_token;
}

export type FcmTokenRow = { id: string; token: string };

export type FcmSendResult = {
  sent: number;
  /** device_tokens ids whose token FCM reported as dead; the caller prunes them. */
  stale: string[];
};

/**
 * Posts one message per token to the HTTP v1 endpoint. Best-effort per
 * device: a thrown fetch counts as neither sent nor stale (a network blip is
 * not evidence the token is dead). Only FCM's own UNREGISTERED error code
 * marks a token dead: a bare 404 can be a routing or endpoint failure for a
 * perfectly valid token (review on PR #192), so status alone never prunes.
 */
export async function sendFcmToTokens(
  rows: FcmTokenRow[],
  title: string,
  body: string,
  data: Record<string, unknown>,
  options: { projectId: string; accessToken: string },
  deps: FcmDeps = defaultDeps,
): Promise<FcmSendResult> {
  const url = `https://fcm.googleapis.com/v1/projects/${options.projectId}/messages:send`;
  // FCM data values must be strings.
  const stringData: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) stringData[k] = typeof v === "string" ? v : JSON.stringify(v);

  const stale: string[] = [];
  let sent = 0;
  await Promise.all(rows.map(async (row) => {
    try {
      const res = await deps.fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${options.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: row.token,
            notification: { title, body },
            data: stringData,
            android: { priority: "high" },
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.ok) {
        sent++;
        return;
      }
      const text = await res.text().catch(() => "");
      if (text.includes("UNREGISTERED")) stale.push(row.id);
    } catch {
      // Best-effort -- never fail the caller over one device.
    }
  }));
  return { sent, stale };
}

/** Reads the two secrets; null when either is missing or the JSON is malformed. */
export function readFcmConfig(): { account: FcmServiceAccount; projectId: string } | null {
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  const projectId = Deno.env.get("FCM_PROJECT_ID");
  if (!raw || !projectId) return null;
  try {
    const account = JSON.parse(raw) as FcmServiceAccount;
    if (!account.client_email || !account.private_key) return null;
    return { account, projectId };
  } catch {
    return null;
  }
}
