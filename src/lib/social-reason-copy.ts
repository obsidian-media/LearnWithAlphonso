import fixtures from "./social-reason.fixtures.json";

/**
 * Wording for every reason code the team, duel and weekly-quest RPCs return. One source:
 * social-reason.fixtures.json, which the iOS Kit holds a byte copy of. social-reason-copy.test.ts fails when a
 * migration returns a code this table does not map.
 */
export const SOCIAL_COPY = fixtures;
const REASONS: Record<string, string> = fixtures.reasons;

/** null/undefined means the call itself failed (network), so the connection copy; unknown codes are generic. */
export function socialReasonMessage(code: string | null | undefined): string {
  if (code === null || code === undefined) return fixtures.connection;
  return REASONS[code] ?? fixtures.generic;
}
