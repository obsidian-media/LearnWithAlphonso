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
 *   - GRANT something on it to `authenticated`, `anon` or PUBLIC (a list of tables or ALL TABLES IN SCHEMA public
 *     both count), or
 *   - carry the marker comment `-- client-grants: none public.<table>` (service-role-only tables).
 * And it must never have a client-facing policy (TO authenticated / anon / public, or no TO clause) without a grant.
 *
 * It reads SQL text only; it cannot see the real database. Not covered: tables created inside DO blocks or dynamic
 * SQL, and CREATE TABLE ... PARTITION OF. The post-deploy check in docs/database-privileges.md covers those.
 */
export type GrantViolation = { table: string; problem: string };

/** Comments (both `--` and block) and the double quotes around identifiers removed. */
const normalise = (sql: string) =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, "")
    .replace(/"([a-z_0-9]+)"/gi, "$1");

const CLIENT_GRANTEE = /\b(authenticated|anon|public)\b/i;

/** The tables a GRANT statement's `ON ...` part names, lower-cased and unqualified, or "*" for all of public. */
function grantTargets(onPart: string): string[] {
  const part = onPart.trim();
  if (/^ALL\s+TABLES\s+IN\s+SCHEMA\s+public$/i.test(part)) return ["*"];
  return part
    .replace(/^TABLE\s+/i, "")
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => !name.includes(".") || name.startsWith("public."))
    .map((name) => name.replace(/^public\./, ""));
}

export function checkNewTableGrants(sql: string): GrantViolation[] {
  const code = normalise(sql);
  const statements = code.split(";").map((s) => s.replace(/\s+/g, " ").trim());

  const tables = [
    ...code.matchAll(
      /CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:([a-z_0-9]+)\.)?([a-z_0-9]+)/gi,
    ),
  ]
    .filter((m) => !m[1] || m[1].toLowerCase() === "public")
    .map((m) => m[2].toLowerCase());

  const clientGrantedTables = new Set<string>();
  for (const statement of statements) {
    const grant = /^GRANT\s+.+?\s+ON\s+(.+?)\s+TO\s+(.+)$/i.exec(statement);
    if (!grant || !CLIENT_GRANTEE.test(grant[2])) continue;
    for (const target of grantTargets(grant[1])) clientGrantedTables.add(target);
  }

  const violations: GrantViolation[] = [];
  for (const table of tables) {
    const granted = clientGrantedTables.has(table) || clientGrantedTables.has("*");
    // The marker is a comment on purpose, so it is read from the raw text.
    const declaredNone = new RegExp(
      `--\\s*client-grants:\\s*none\\s+public\\.${table}\\b`,
      "i",
    ).test(sql);
    const clientPolicies = statements.filter((statement) => {
      if (!new RegExp(`^CREATE POLICY .* ON (?:public\\.)?${table}\\b`, "i").test(statement))
        return false;
      const to = /\sTO\s+([a-z_,\s]+?)(?:\s+(?:USING|WITH)\b|$)/i.exec(statement);
      // No TO clause means PUBLIC, i.e. everyone, including the client roles.
      return !to || CLIENT_GRANTEE.test(to[1]);
    });

    if (!granted && !declaredNone) {
      violations.push({
        table,
        problem:
          `public.${table} is created without a GRANT to authenticated/anon and without the marker ` +
          `"-- client-grants: none public.${table}". New tables start with no client privileges.`,
      });
    }
    if (!granted && clientPolicies.length > 0) {
      violations.push({
        table,
        problem: `public.${table} has a client-facing policy but no GRANT to authenticated/anon, so the policy can never apply`,
      });
    }
  }
  return violations;
}
