/**
 * Sentry (crash and error reporting) settings shared by the web client and server.
 *
 * The DSN is a PUBLIC client DSN: Sentry designs it to ship inside apps and
 * pages, so it is committed. It can only submit events to this one project.
 * Source-map upload needs an auth token the owner creates (see
 * docs/sentry-crash-reporting.md); no secret lives in this repo.
 */
export const SENTRY_WEB_DSN =
  "https://722a8807ab8334a0f6ca9002e02911ef@o4511662373273600.ingest.us.sentry.io/4512372763328513";

/** Ingest origin, allowed in the CSP's connect-src. Derived from the DSN so the two cannot drift. */
export const SENTRY_INGEST_ORIGIN = new URL(SENTRY_WEB_DSN).origin;

/** Performance tracing is off: crash/error reporting only. */
export const SENTRY_TRACES_SAMPLE_RATE = 0;

/**
 * Reporting is on only in a production build with a DSN. Tests, local dev and
 * preview builds without NODE_ENV=production never send.
 */
export function sentryDsnFor(opts: { production: boolean; override?: string }): string | undefined {
  if (!opts.production) return undefined;
  const dsn = opts.override?.trim() || SENTRY_WEB_DSN;
  return dsn || undefined;
}
