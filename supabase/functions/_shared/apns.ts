// Minimal APNs HTTP/2 sender for real (remote) push notifications -- V4
// candidate #2 (docs/BACKLOG.md sec 2.1). See
// docs/superpowers/specs/2026-09-21-remote-push-notifications-design.md
// for the full design.
//
// Gracefully no-ops when APNs secrets aren't configured -- the same
// "nil/empty secret -> feature does nothing, never crashes, never breaks
// the caller" contract AppConfig.swift's revenueCatAPIKey already
// establishes on the iOS side. Every call site here (send-push/index.ts,
// complete-lesson/index.ts) MUST treat a { skipped: "not_configured" }
// result as a normal outcome, not an error -- a nudge insert or a lesson
// completion must always succeed even when push delivery can't happen
// yet.
//
// Requires (Edge Function secrets -- `supabase secrets set ...`), none of
// which exist yet as of this slice:
//   APNS_KEY_P8    - contents of the .p8 Auth Key file from
//                     developer.apple.com -> Certificates, Identifiers &
//                     Profiles -> Keys. No agent can create this -- it's
//                     an interactive portal action, same category as the
//                     still-open RevenueCat Paid Applications Agreement.
//   APNS_KEY_ID    - the 10-character Key ID for that key.
//   APNS_TEAM_ID   - the Apple Developer Team ID.
//   APNS_BUNDLE_ID - com.obsidianmedia.learnwithalphonso (see
//                     AppConfig.swift's googleSignInURLScheme, same
//                     bundle id).
// Optional: APNS_HOST -- defaults to the production APNs host. Set to
// https://api.sandbox.push.apple.com for a Debug-signed build's device
// tokens (which register against the sandbox APNs environment).

import type { SupabaseClient } from "@supabase/supabase-js";

function apnsConfigured(): boolean {
  return !!(
    Deno.env.get("APNS_KEY_P8") &&
    Deno.env.get("APNS_KEY_ID") &&
    Deno.env.get("APNS_TEAM_ID") &&
    Deno.env.get("APNS_BUNDLE_ID")
  );
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importSigningKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

// APNs auth tokens are valid up to an hour -- cached per Edge Function
// isolate (which is itself short-lived) rather than re-signed on every
// send within the same invocation batch.
let cachedKey: CryptoKey | null = null;

async function buildAuthToken(): Promise<string> {
  const header = { alg: "ES256", kid: Deno.env.get("APNS_KEY_ID")! };
  const payload = { iss: Deno.env.get("APNS_TEAM_ID")!, iat: Math.floor(Date.now() / 1000) };
  const encHeader = base64url(new TextEncoder().encode(JSON.stringify(header)));
  const encPayload = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encHeader}.${encPayload}`;

  if (!cachedKey) {
    cachedKey = await importSigningKey(Deno.env.get("APNS_KEY_P8")!);
  }
  // WebCrypto's ECDSA signature output is the raw (r || s) IEEE P1363
  // format -- exactly what a JWS ES256 signature needs, no DER
  // re-encoding required.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cachedKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

export type SendPushResult = {
  sent: number;
  skipped: "not_configured" | null;
};

/**
 * Sends a push to every device this user has registered
 * (public.device_tokens). Best-effort per-device: one device's failure
 * never throws, and a 400/410 (bad/unregistered token) response prunes
 * that row so future sends don't keep retrying a dead token. `admin`
 * must be a service_role client (device_tokens' RLS is own-row-only;
 * this always sends on behalf of a *different* user than the caller).
 */
export async function sendPushToUser(
  admin: SupabaseClient,
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<SendPushResult> {
  if (!apnsConfigured()) {
    return { sent: 0, skipped: "not_configured" };
  }

  const { data: tokens } = await admin
    .from("device_tokens")
    .select("id, token")
    .eq("user_id", userId);
  if (!tokens || tokens.length === 0) {
    return { sent: 0, skipped: null };
  }

  const jwt = await buildAuthToken();
  const bundleId = Deno.env.get("APNS_BUNDLE_ID")!;
  const host = Deno.env.get("APNS_HOST") ?? "https://api.push.apple.com";
  const staleTokenIds: string[] = [];
  let sent = 0;

  await Promise.all(tokens.map(async (row: { id: string; token: string }) => {
    try {
      const res = await fetch(`${host}/3/device/${row.token}`, {
        method: "POST",
        headers: {
          "authorization": `bearer ${jwt}`,
          "apns-topic": bundleId,
          "apns-push-type": "alert",
          "apns-priority": "10",
        },
        body: JSON.stringify({
          aps: { alert: { title, body }, sound: "default" },
          ...data,
        }),
      });
      if (res.ok) {
        sent++;
      } else if (res.status === 400 || res.status === 410) {
        staleTokenIds.push(row.id);
      }
    } catch {
      // Best-effort -- a single device's delivery failure must never
      // fail the caller (nudge insert / lesson completion).
    }
  }));

  if (staleTokenIds.length > 0) {
    await admin.from("device_tokens").delete().in("id", staleTokenIds);
  }

  return { sent, skipped: null };
}
