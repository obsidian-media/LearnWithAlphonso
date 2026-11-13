/** Emergency off switch for the server hearts gate. Default on: only the literal "false" disables it. */
export function heartsGateEnforced(env: Record<string, string | undefined> = process.env): boolean {
  return env.ENFORCE_HEARTS_GATE !== "false";
}

/**
 * Hearts settled on the server when a lesson completes (settle_lesson_hearts). Enforced by default (owner decision
 * 2026-11-12): "on" charges the misses the app did not already report through lose_heart. "shadow" records what the
 * settlement would charge and charges nothing; "off" skips the settlement entirely. Only those two literals opt out:
 * a typo enforces, because enforcement is the rule. Keep identical to supabase/functions/_shared/hearts.ts's
 * serverHeartsMode.
 */
export type ServerHeartsMode = "off" | "shadow" | "on";

export function serverHeartsMode(
  env: Record<string, string | undefined> = process.env,
): ServerHeartsMode {
  const v = env.SERVER_HEARTS?.trim().toLowerCase();
  return v === "shadow" || v === "off" ? v : "on";
}
