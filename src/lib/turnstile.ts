/**
 * Cloudflare Turnstile for the web email forms. Off unless VITE_TURNSTILE_SITE_KEY is set at build time; with it set,
 * each email request carries the widget's token so the auth server's captcha setting can be switched on. The native
 * apps do not show a captcha, which is why the server setting stays an owner decision (docs/security.md).
 */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
export const TURNSTILE_SCRIPT = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;

export function turnstileSiteKey(): string | undefined {
  const key = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  return typeof key === "string" && key.trim() ? key.trim() : undefined;
}

/** `{ captchaToken }` when there is a token, otherwise nothing, so requests without a captcha are unchanged. */
export function captchaOptions(token: string | null): { captchaToken?: string } {
  return token ? { captchaToken: token } : {};
}
