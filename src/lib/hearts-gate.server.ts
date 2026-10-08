/** Emergency off switch for the server hearts gate. Default on: only the literal "false" disables it. */
export function heartsGateEnforced(env: Record<string, string | undefined> = process.env): boolean {
  return env.ENFORCE_HEARTS_GATE !== "false";
}
