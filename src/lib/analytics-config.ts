/**
 * PostHog (optional product analytics) settings for the web client.
 *
 * The project key is a PUBLIC client key, but this repo is public too, so it is not committed: it is a
 * build-time variable (VITE_POSTHOG_KEY, set in Vercel). Unset means analytics is off everywhere.
 */
export const POSTHOG_HOST = "https://us.i.posthog.com";

/** Allowed in the CSP connect-src. Derived from POSTHOG_HOST so the two cannot drift. */
export const POSTHOG_ORIGIN = new URL(POSTHOG_HOST).origin;
