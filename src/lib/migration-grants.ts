/**
 * Guard for new tables (docs/database-privileges.md).
 *
 * Since migration 20261006120000 a new table in `public` starts with NO privileges for the client roles
 * (`anon`, `authenticated`): Supabase's old default of "everything for everyone, RLS decides" is gone, so a
 * forgotten policy can no longer leave a table writable by anyone with the public key. The price is that every
 * migration that creates a table must say, in the same file, what clients may do with it. This checker enforces
 * that in CI, because the failure mode of forgetting is a table whose policies exist but whose privileges do not:
 * every client call returns "permission denied" and nothing in the code review shows it.
 *
 * A new table must either
 *   - GRANT something on it to `authenticated` and/or `anon`, or
 *   - carry the marker comment `-- client-grants: none public.<table>` (service-role-only tables).
 * And it must never have a client-facing policy (TO authenticated / anon / public, or no TO clause) without a grant.
 */
export type GrantViolation = { table: string; problem: string };

const stripComments = (sql: string) => sql.replace(/--[^\n]*/g, "");

export function checkNewTableGrants(sql: string): GrantViolation[] {
  const code = stripComments(sql);
  const tables = [
    ...code.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z_0-9]+)/gi),
  ].map((m) => m[1].toLowerCase());
  const violations: GrantViolation[] = [];
  for (const table of tables) {
    const granted = new RegExp(
      `GRANT\\s[^;]*\\sON\\s+(?:TABLE\\s+)?public\\.${table}\\s+TO\\s[^;]*\\b(?:authenticated|anon)\\b`,
      "i",
    ).test(code);
    const declaredNone = new RegExp(
      `--\\s*client-grants:\\s*none\\s+public\\.${table}\\b`,
      "i",
    ).test(sql);
    const policyOnTable = [
      ...code.matchAll(
        new RegExp(`CREATE\\s+POLICY\\s[^;]*\\sON\\s+public\\.${table}\\s[^;]*;`, "gi"),
      ),
    ]
      .map((m) => m[0])
      .filter((policy) => {
        const to = /\sTO\s+([a-z_,\s]+?)(?:\s+(?:USING|WITH)\b|;|$)/i.exec(policy);
        // No TO clause means PUBLIC, i.e. everyone, including the client roles.
        return !to || /\b(authenticated|anon|public)\b/i.test(to[1]);
      });

    if (!granted && !declaredNone) {
      violations.push({
        table,
        problem:
          `public.${table} is created without a GRANT to authenticated/anon and without the marker ` +
          `"-- client-grants: none public.${table}". New tables start with no client privileges.`,
      });
    }
    if (!granted && policyOnTable.length > 0) {
      violations.push({
        table,
        problem: `public.${table} has a client-facing policy but no GRANT to authenticated/anon, so the policy can never apply`,
      });
    }
  }
  return violations;
}
