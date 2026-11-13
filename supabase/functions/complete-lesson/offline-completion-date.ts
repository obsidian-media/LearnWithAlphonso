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
