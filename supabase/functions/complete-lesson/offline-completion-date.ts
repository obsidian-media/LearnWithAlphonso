import { localDay } from "../_shared/local-day.ts";

/**
 * Resolve a queued lesson's original UTC completion day, but only within the
 * server-issued lesson session. This gives offline learners a bounded streak
 * grace without accepting an arbitrary client-chosen historical date.
 *
 * A time outside [session issued, now] is clamped into that window, not
 * refused: the device clock is the only source of `completedAt`, so a phone a
 * few seconds fast would otherwise turn a legitimate lesson into a 400, which
 * both native clients dead-letter (the learner loses the XP and the streak
 * day). Clamping keeps the same bound, the day can never be earlier than the
 * signed session or later than the server's today.
 *
 * Returns null only when there is nothing trustworthy to clamp to; the caller
 * then credits the server's own day, as it did before offline dates existed.
 */
export function verifiedOfflineCompletionDay(
  completedAt: string,
  sessionIssuedAtMs: number,
  now: Date,
  timeZone?: string | null,
): string | null {
  const completedAtMs = Date.parse(completedAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(sessionIssuedAtMs) || !Number.isFinite(completedAtMs)) return null;
  if (sessionIssuedAtMs > nowMs) return null;
  const clampedMs = Math.min(Math.max(completedAtMs, sessionIssuedAtMs), nowMs);
  // The learner's own calendar day (UTC when no zone is known), like every other day the server books.
  return localDay(clampedMs, timeZone);
}

/** How long a lesson session stays valid for a completion that arrives live: covers the lesson plus real-world pauses. */
export const LIVE_SESSION_MAX_AGE_MS = 3 * 60 * 60 * 1000;

/**
 * How long a lesson session stays valid for a QUEUED completion (one that carries the device's `completedAt`).
 * A lesson finished on a train, overnight or on a weekend away reaches the server long after the 3 hours a live
 * completion allows. Rejecting it made both native clients mint a fresh session and drop the date, so the lesson was
 * credited to the day it SYNCED and a learner who played every day lost the streak they had earned. The session is
 * still a server-signed proof that the learner opened this very lesson, and the day is still clamped into
 * [session issued, now], so the longest a day can be moved back is this window. The window is kept short on purpose: a
 * session hoarded on a day the learner did not study can bridge at most this much of a gap.
 */
export const OFFLINE_SESSION_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export function sessionMaxAgeMs(completedAt: string | undefined): number {
  return completedAt ? OFFLINE_SESSION_MAX_AGE_MS : LIVE_SESSION_MAX_AGE_MS;
}
