import type { StaffLimit } from "../staff-rate-limit";

/**
 * Stands in for consumeStaffLimit in the console tests that are about something else: the same fixed-window
 * counting the database function does, in memory. The real function is tested against Postgres in
 * staff-rate-limit.test.ts.
 */
const counts = new Map<string, number>();

export async function fakeConsumeStaffLimit(
  _client: unknown,
  actor: string,
  limit: StaffLimit,
): Promise<boolean> {
  const key = `${actor}:${limit.bucket}`;
  const used = counts.get(key) ?? 0;
  if (used >= limit.max) return false;
  counts.set(key, used + 1);
  return true;
}
