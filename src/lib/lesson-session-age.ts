/**
 * How long a lesson session token is good for, as the lesson page sees it. The server's own MAX_AGE_MS lives in
 * lesson-session.server.ts, which a page cannot import; lesson-session-age.test.ts reads that file and fails when the
 * two disagree.
 */
export const LESSON_SESSION_MAX_AGE_MS = 3 * 60 * 60 * 1000;

/** Renewed this long before the server would refuse it, because this device's clock and the server's can differ. */
export const LESSON_SESSION_RENEW_MARGIN_MS = 10 * 60 * 1000;

/**
 * True when a token received at `receivedAtMs` (this device's clock) should be swapped for a fresh one before the
 * lesson is completed. Without this, a lesson left open over lunch finished into "Invalid or expired lesson session".
 */
export function lessonSessionNeedsRenewal(receivedAtMs: number, nowMs: number): boolean {
  return nowMs - receivedAtMs >= LESSON_SESSION_MAX_AGE_MS - LESSON_SESSION_RENEW_MARGIN_MS;
}

/**
 * True when the server refused the lesson session itself (expired, or not this user's/lesson's), the one completion
 * failure where a retry needs a new token. Anything else (offline, a lost reply, a 500) retries with the same one.
 */
export function isInvalidLessonSession(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return message.includes("Invalid or expired lesson session");
}
