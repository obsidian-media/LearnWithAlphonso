import { createHash, timingSafeEqual } from "node:crypto";

export const MIN_SHARED_SECRET_LENGTH = 32;

/**
 * Constant-time comparison of a shared secret. Both sides are SHA-256 digests (always 32 bytes), so neither the
 * comparison nor a length check leaks anything about the expected value. A short or empty expected secret never
 * matches.
 */
export function secretMatches(expected: string, given: string | null | undefined): boolean {
  if (expected.length < MIN_SHARED_SECRET_LENGTH || !given) return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(expected), digest(given));
}
