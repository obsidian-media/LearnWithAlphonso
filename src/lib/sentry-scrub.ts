/**
 * Privacy scrubber for everything Sentry is about to send (web client and
 * server). Pure functions, no Sentry import, so it is unit-tested directly
 * (sentry-scrub.test.ts) and shared by both runtimes.
 *
 * Removes: email addresses, JWTs (Supabase access/refresh tokens), bearer
 * and API-key style tokens, sensitive URL query/fragment parameters, the
 * Authorization/Cookie headers, and any user identity fields. Error text and
 * stack traces are otherwise kept: they are the point of the report.
 */

const REDACTED = "[redacted]";
const MAX_DEPTH = 8;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
// header.payload.signature, each base64url; header and payload begin with "eyJ" ({"...).
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
// Supabase key formats and common secret prefixes (sb_secret_, sk_live_, ...).
const SECRET_KEY =
  /\b(?:sb_secret|sb_publishable|sk_live|sk_test|rk_live|pk_live)_[A-Za-z0-9_-]{8,}/g;
// Account ids: Supabase filters look like user_id=eq.<uuid>; a uuid is never needed to read a report.
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const URL_KEYS = /^(url|from|to|query_string|query)$/i;
const SENSITIVE_PARAM =
  /([?&#;])(access_token|refresh_token|id_token|token|token_hash|code|apikey|api_key|key|email|password|secret|otp|session|state)=([^&#\s]*)/gi;

const SENSITIVE_KEY = /authorization|cookie|token|secret|password|apikey|api_key|set-cookie/i;

/** Drops the query string and fragment of a URL or path; they hold ids, tokens and filters. */
export function stripQuery(value: string): string {
  return value.replace(/[?#].*$/s, "");
}

export function scrubString(value: string): string {
  return value
    .replace(SENSITIVE_PARAM, (_m, sep: string, name: string) => `${sep}${name}=${REDACTED}`)
    .replace(JWT, REDACTED)
    .replace(BEARER, (_m, scheme: string) => `${scheme} ${REDACTED}`)
    .replace(SECRET_KEY, REDACTED)
    .replace(UUID, "[id]")
    .replace(EMAIL, "[email]");
}

/** Recursively scrubs every string and drops values under secret-looking keys. */
export function scrubValue<T>(value: T, depth = 0): T {
  if (typeof value === "string") return scrubString(value) as T;
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return REDACTED as T;
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key) && v != null) out[key] = REDACTED;
    else if (URL_KEYS.test(key) && typeof v === "string") out[key] = scrubString(stripQuery(v));
    else out[key] = scrubValue(v, depth + 1);
  }
  return out as T;
}

type SentryLikeEvent = {
  user?: unknown;
  request?: { headers?: unknown; cookies?: unknown; data?: unknown; [k: string]: unknown };
  [k: string]: unknown;
};

/**
 * `beforeSend` for both runtimes. Never returns null (an error report is
 * still wanted); it returns the event with identity and secrets removed.
 */
export function scrubEvent<E extends object>(event: E): E {
  const scrubbed = scrubValue(event) as unknown as SentryLikeEvent;
  // No identity at all: Sentry would otherwise attach an IP and any user the app set.
  delete scrubbed.user;
  if (scrubbed.request) delete scrubbed.request.query_string;
  if (scrubbed.request) {
    delete scrubbed.request.cookies;
    delete scrubbed.request.data; // request bodies can hold answers, transcripts, credentials
    scrubbed.request.headers = undefined;
  }
  // Server name is the host (a Vercel build id); not identifying, but not needed either.
  delete scrubbed.server_name;
  return scrubbed as unknown as E;
}

/** `beforeBreadcrumb`: scrubs the message and data, and drops console breadcrumbs entirely (free-form app logs). */
export function scrubBreadcrumb<B extends { category?: string }>(breadcrumb: B): B | null {
  if (breadcrumb.category === "console") return null;
  return scrubValue(breadcrumb);
}
