/**
 * Plain words for what the auth server says. The sign-in page used to show its raw message ("over_email_send_rate_limit",
 * "captcha protection: request disallowed (invalid-input-response)"), which tells a learner nothing about what to do.
 *
 * Matched on supabase-js's stable `code` first, then on the older message text for servers and paths that send no
 * code. Anything unknown gets the caller's fallback, never the raw text.
 */

export const AUTH_ERROR_COPY = {
  emailRateLimit:
    "We've sent several emails to this address already. Wait a few minutes, then try again.",
  requestRateLimit: "Too many tries in a short time. Wait a minute, then try again.",
  captcha: "The quick bot check didn't go through. Complete it again, then retry.",
  userExists:
    "There's already an account with this email. Sign in instead, or reset your password.",
  weakPassword:
    "That password is too easy to guess. Try a longer one, or mix in numbers and symbols.",
  invalidCredentials: "That email and password don't match. Check them and try again.",
  emailNotConfirmed:
    "This email isn't confirmed yet. Tap Send a new code, then enter the 6-digit code from that email.",
  badCode: "That code is wrong or has expired. Check it, or send a new code.",
  offline: "We couldn't reach the server. Check your connection and try again.",
  generic: "Something went wrong. Please try again.",
} as const;

export type AuthErrorKind = keyof typeof AUTH_ERROR_COPY;

const BY_CODE: Record<string, AuthErrorKind> = {
  over_email_send_rate_limit: "emailRateLimit",
  over_request_rate_limit: "requestRateLimit",
  over_sms_send_rate_limit: "requestRateLimit",
  captcha_failed: "captcha",
  user_already_exists: "userExists",
  email_exists: "userExists",
  weak_password: "weakPassword",
  invalid_credentials: "invalidCredentials",
  email_not_confirmed: "emailNotConfirmed",
  otp_expired: "badCode",
};

const BY_MESSAGE: [RegExp, AuthErrorKind][] = [
  [/email rate limit|for security purposes, you can only request/i, "emailRateLimit"],
  [/rate limit|too many requests/i, "requestRateLimit"],
  [/captcha/i, "captcha"],
  [/already registered|already exists/i, "userExists"],
  [/password should|weak password|password is known/i, "weakPassword"],
  [/invalid login credentials/i, "invalidCredentials"],
  [/email not confirmed/i, "emailNotConfirmed"],
  [/token has expired|otp.*(expired|invalid)|invalid.*(token|otp)/i, "badCode"],
  [/failed to fetch|networkerror|load failed|network request failed/i, "offline"],
];

/** Which known failure this is, or null for one this page has no words for. */
export function authErrorKind(error: unknown): AuthErrorKind | null {
  if (typeof error !== "object" || error === null) return null;
  const { code, message, name, status } = error as {
    code?: unknown;
    message?: unknown;
    name?: unknown;
    status?: unknown;
  };
  if (typeof code === "string" && BY_CODE[code]) return BY_CODE[code];
  if (name === "AuthRetryableFetchError") return "offline";
  if (typeof message === "string") {
    for (const [re, kind] of BY_MESSAGE) if (re.test(message)) return kind;
  }
  if (status === 429) return "requestRateLimit";
  return null;
}

/** The sentence to show for an auth failure. */
export function friendlyAuthError(
  error: unknown,
  fallback: string = AUTH_ERROR_COPY.generic,
): string {
  const kind = authErrorKind(error);
  return kind ? AUTH_ERROR_COPY[kind] : fallback;
}
