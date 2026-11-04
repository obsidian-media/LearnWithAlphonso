import * as Sentry from "@sentry/react";

import { SENTRY_TRACES_SAMPLE_RATE, sentryDsnFor } from "./sentry-config";
import { scrubBreadcrumb, scrubEvent } from "./sentry-scrub";

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
    override: import.meta.env.VITE_SENTRY_DSN as string | undefined,
  });
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: "production",
    sendDefaultPii: false,
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
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
