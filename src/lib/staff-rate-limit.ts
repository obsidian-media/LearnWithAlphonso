/**
 * A small sliding-window limiter, kept in memory per server instance. It is a brake on a staff account that runs
 * away (a stuck script, a stolen session), not a precise quota: another instance has its own window. The ceilings are
 * low enough that this is still a real limit.
 */
export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    /** True when the call is allowed (and counted). */
    allow(key: string, now: number = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}
