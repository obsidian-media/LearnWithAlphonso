/**
 * Rehearsals have two switches. REHEARSALS_ENABLED is the global kill switch: a server env var, on only when it is
 * exactly "true", so web and the native apps (which read it from the API) all switch together. On top of it, one
 * account can be switched OFF (a row in `rehearsals_off`, written only by the server: see set_rehearsals_off in
 * 20261130100000_rehearsals_switch_and_auto_close.sql). Off for the account wins over on for everyone, and a client has
 * no way to write the row, so it can never turn itself back on.
 *
 * Every gate asks `rehearsalsEnabledFor(db, userId)`: /api/rehearsal, the rehearsal mode of /api/chat, /api/app-config
 * (when it knows who is asking) and the path's pinned rehearsal.
 */
export const REHEARSALS_FLAG = "REHEARSALS_ENABLED";

export const rehearsalsEnabled = (): boolean => process.env[REHEARSALS_FLAG] === "true";

/** The one read the account switch needs, typed structurally so a test double and the service-role client both fit. */
export type RehearsalSwitchDb = {
  from: (table: "rehearsals_off") => {
    select: (cols: string) => {
      eq: (
        col: string,
        value: string,
      ) => {
        maybeSingle: () => PromiseLike<{
          data: { user_id: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

/**
 * Whether rehearsals are on for THIS account: the global switch is on and the account has not been switched off. A
 * failed read of the account switch answers "off" (fail closed): an outage must not show rehearsals to an account the
 * owner turned off.
 */
export async function rehearsalsEnabledFor(
  db: RehearsalSwitchDb | unknown,
  userId: string,
): Promise<boolean> {
  if (!rehearsalsEnabled()) return false;
  try {
    const { data, error } = await (db as RehearsalSwitchDb)
      .from("rehearsals_off")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return false;
    return data === null;
  } catch {
    return false;
  }
}
