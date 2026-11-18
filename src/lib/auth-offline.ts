/**
 * Telling "signed out" from "could not reach the auth server". The signed-in layout used to treat both alike and
 * send a learner on a train to the sign-in page; now only a missing session does.
 */

/** Thrown by the signed-in layout when the session could not be checked because the network failed. */
export class AuthOfflineError extends Error {
  constructor() {
    super("auth-offline");
    this.name = "AuthOfflineError";
  }
}

export function isAuthOfflineError(error: unknown): boolean {
  return (
    error instanceof AuthOfflineError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "AuthOfflineError")
  );
}

/**
 * True for a failure to reach the auth server: supabase-js's retryable fetch error (what getSession returns when an
 * expired token cannot be refreshed offline), a browser fetch TypeError, or any error while the browser says it is
 * offline. False for a real answer from the server (an invalid or revoked session).
 */
export function isNetworkAuthError(error: unknown): boolean {
  if (isAuthOfflineError(error)) return true;
  if (typeof error !== "object" || error === null) return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "AuthRetryableFetchError") return true;
  if (
    name === "TypeError" &&
    typeof message === "string" &&
    /fetch|network|load failed/i.test(message)
  ) {
    return true;
  }
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
