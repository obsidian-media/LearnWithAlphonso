type ErrorReportOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

/**
 * Client-side error sink. Currently logs to the console; swap the body for
 * Sentry (or whatever's chosen) when one is wired up — this is the single
 * call site (see src/routes/__root.tsx) that would need to change.
 */
export function reportError(
  error: unknown,
  context: Record<string, unknown> = {},
  options: ErrorReportOptions = {},
) {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line no-console
  console.error("[error-report]", error, {
    route: window.location.pathname,
    mechanism: options.mechanism ?? "manual",
    severity: options.severity ?? "error",
    ...context,
  });
}
