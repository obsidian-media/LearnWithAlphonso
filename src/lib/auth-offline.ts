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

/**
 * True when the auth server answered that this session is no good: 401/403, or a session or user it no longer has.
 * Only that drops the session from this browser; a 500 or a 429 during an auth outage says nothing about the session.
 */
export function isRefusedSessionError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { status, code } = error as { status?: unknown; code?: unknown };
  if (status === 401 || status === 403) return true;
  return code === "session_not_found" || code === "user_not_found" || code === "bad_jwt";
}

/**
 * A sign-out the learner did not ask for (a stale session dropped on the sign-in page). The app's SIGNED_OUT handler
 * still clears the last account's data, but keeps the first-run draft of the person about to sign up.
 */
let keepDraftOnNextSignOut = false;
export function markStaleSessionDrop(): void {
  keepDraftOnNextSignOut = true;
}
/** Read once by the SIGNED_OUT handler: true when the sign-out was a stale-session drop. */
export function takeStaleSessionDrop(): boolean {
  const was = keepDraftOnNextSignOut;
  keepDraftOnNextSignOut = false;
  return was;
}
