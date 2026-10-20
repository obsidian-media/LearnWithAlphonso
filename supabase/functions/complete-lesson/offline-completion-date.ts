/**
 * Resolve a queued lesson's original UTC completion day, but only within the
 * server-issued lesson session. This gives offline learners a bounded streak
 * grace without accepting an arbitrary client-chosen historical date.
 */
export function verifiedOfflineCompletionDay(
  completedAt: string,
  sessionIssuedAtMs: number,
  now: Date,
): string | null {
  const completedAtMs = Date.parse(completedAt);
  if (!Number.isFinite(sessionIssuedAtMs) || !Number.isFinite(completedAtMs)) return null;
  if (completedAtMs < sessionIssuedAtMs || completedAtMs > now.getTime()) return null;
  return new Date(completedAtMs).toISOString().slice(0, 10);
}
