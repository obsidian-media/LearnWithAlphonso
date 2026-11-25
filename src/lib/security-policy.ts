import { POSTHOG_ORIGIN } from "./analytics-config";
import { SENTRY_INGEST_ORIGIN } from "./sentry-config";
import { HSTS_VALUE } from "./static-headers";
import { TURNSTILE_ORIGIN } from "./turnstile";

const CSP_NONCE_HEADER = "x-app-csp-nonce";

export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function readCspNonce(request: Request): string | undefined {
  return request.headers.get(CSP_NONCE_HEADER) ?? undefined;
}

export async function requestWithCspNonce(request: Request, nonce: string): Promise<Request> {
  const headers = new Headers(request.headers);
  // Always replace a caller-provided value: the nonce is server-generated.
  headers.set(CSP_NONCE_HEADER, nonce);
  // Rebuild from bytes: Nitro can supply a Request whose body/signal are from
  // another runtime realm and cannot be passed to Node's undici constructor.
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : new Uint8Array(await request.arrayBuffer());
  return new Request(request.url, {
    method: request.method,
    headers,
    body,
  });
}

/**
 * The project's original Supabase host. Always allowed alongside the configured SUPABASE_URL (now
 * https://api.learnwithalphonso.com): stored public storage URLs (vocab images) and older native/web builds still
 * point at it, and it keeps working. Drop it only after those are migrated.
 */
export const LEGACY_SUPABASE_ORIGIN = "https://qhcjpfbxfcltjbiuknyt.supabase.co";

export function contentSecurityPolicy(nonce: string, supabaseUrl?: string): string {
  let supabaseOrigin: string | undefined;
  try {
    if (supabaseUrl) {
      const parsedUrl = new URL(supabaseUrl);
      // Never permit a production CSP to authorize plaintext Supabase traffic.
      if (parsedUrl.protocol === "https:") supabaseOrigin = parsedUrl.origin;
    }
  } catch {
    // Invalid/missing configuration adds no configured origin. The only fixed first-party exception is
    // LEGACY_SUPABASE_ORIGIN below, which is always allowed: it is a constant, never derived from input.
  }
  const realtimeOrigin = supabaseOrigin?.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
  const legacyOrigin =
    LEGACY_SUPABASE_ORIGIN === supabaseOrigin ? undefined : LEGACY_SUPABASE_ORIGIN;
  const legacyRealtime = legacyOrigin?.replace(/^https:/, "wss:");
  const connect = [
    "'self'",
    supabaseOrigin,
    realtimeOrigin,
    legacyOrigin,
    legacyRealtime,
    SENTRY_INGEST_ORIGIN,
    POSTHOG_ORIGIN,
  ]
    .filter(Boolean)
    .join(" ");
  const images = ["'self'", "data:", "blob:", supabaseOrigin, legacyOrigin]
    .filter(Boolean)
    .join(" ");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Existing React and motion components use style attributes/inline styles.
    // Script execution remains nonce-only; style tightening is a separate migration.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${images}`,
    // data: is the one-tenth-of-a-second silent clip that unlocks the voice for Hector and the call (voice-playback.ts).
    `media-src ${["'self'", "blob:", "data:", supabaseOrigin, legacyOrigin].filter(Boolean).join(" ")}`,
    `connect-src ${connect}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    // Turnstile's challenge iframe (src/lib/turnstile.ts); its script loads through 'strict-dynamic'.
    `frame-src ${TURNSTILE_ORIGIN}`,
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

export function addSecurityHeaders(response: Response, request: Request, nonce: string): Response {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set(
    "permissions-policy",
    "camera=(), geolocation=(), microphone=(self), payment=(), usb=()",
  );
  if (process.env.NODE_ENV === "production") {
    headers.set("content-security-policy", contentSecurityPolicy(nonce, process.env.SUPABASE_URL));
    if (new URL(request.url).protocol === "https:") {
      // Same value as the static files (static-headers.ts / vercel.json). Sent from the apex learnwithalphonso.com,
      // includeSubDomains covers every *.learnwithalphonso.com host (admin, api, www), which must all stay HTTPS-only.
      // It never reaches sibling domains such as discover.alphonsoecosystem.app.
      headers.set("strict-transport-security", HSTS_VALUE);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
