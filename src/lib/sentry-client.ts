import * as Sentry from "@sentry/react";

import { UNDER_13_KEY } from "./first-run";
import { SENTRY_TRACES_SAMPLE_RATE, sentryDsnFor } from "./sentry-config";
import { scrubBreadcrumb, scrubEvent } from "./sentry-scrub";

/**
 * A device that answered Under 13 in the first run sends us nothing at all (privacy policy, Children), crash
 * reports included. Read at send time, not just at start: the block can happen mid-visit, and Sentry would
 * otherwise post a session on the next route change.
 */
function under13Device(): boolean {
  try {
    return window.localStorage.getItem(UNDER_13_KEY) === "1";
  } catch {
    return false;
  }
}

let initialised = false;

/**
 * Starts browser crash/error reporting. A no-op outside a production browser
 * build (tests, local dev, SSR). Privacy: no default PII, no Session Replay
 * (the integration is never imported), no tracing, every event and breadcrumb
 * scrubbed (sentry-scrub.ts). Idempotent.
 */
export function initSentryClient(): boolean {
  if (initialised) return true;
  if (typeof window === "undefined") return false;
  const dsn = sentryDsnFor({
    production: Boolean(import.meta.env.PROD),
    vercelEnv: import.meta.env.VITE_VERCEL_ENV as string | undefined,
    override: import.meta.env.VITE_SENTRY_DSN as string | undefined,
  });
  if (!dsn || under13Device()) return false;
  Sentry.init({
    dsn,
    environment: "production",
    sendDefaultPii: false,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    // fetch/xhr breadcrumbs record Supabase URLs (user_id=eq.<uuid>): off, not just scrubbed.
    integrations: [Sentry.breadcrumbsIntegration({ fetch: false, xhr: false })],
    beforeSend: (event) => (under13Device() ? null : scrubEvent(event)),
    beforeBreadcrumb: (breadcrumb) => (under13Device() ? null : scrubBreadcrumb(breadcrumb)),
    // The one door every envelope (errors, sessions, client reports) goes through.
    transport: (options) => {
      const inner = Sentry.makeFetchTransport(options);
      return {
        ...inner,
        send: (envelope) => (under13Device() ? Promise.resolve({}) : inner.send(envelope)),
      };
    },
  });
  initialised = true;
  return true;
}

export function captureClientError(
  error: unknown,
  context: Record<string, unknown>,
  tags: Record<string, string>,
  level: "error" | "warning" | "info",
): void {
  if (!initialised) return;
  Sentry.captureException(error, { extra: context, tags, level });
}
