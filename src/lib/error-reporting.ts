import { captureClientError } from "./sentry-client";

type ErrorReportOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

/**
 * Client-side error sink: logs to the console and forwards to Sentry when
 * Sentry is running (production browser builds only; see sentry-client.ts).
 * Events are scrubbed of emails and tokens before they leave the browser.
 */
export function reportError(
  error: unknown,
  context: Record<string, unknown> = {},
  options: ErrorReportOptions = {},
) {
  if (typeof window === "undefined") return;
  const route = window.location.pathname;
  const mechanism = options.mechanism ?? "manual";
  const severity = options.severity ?? "error";
  console.error("[error-report]", error, { route, mechanism, severity, ...context });
  captureClientError(error, { route, ...context }, { mechanism }, severity);
}
