import fs from "node:fs";
import path from "node:path";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../../supabase/migrations");
const CLIENT_ROLE = /\b(authenticated|public)\b/i;

/**
 * Replays every CREATE / DROP POLICY in the given SQL in order and returns, per table, the set of commands
 * (SELECT, INSERT, UPDATE, DELETE) that some surviving policy covers *for the signed-in user*: FOR ALL covers all
 * four, a missing FOR means ALL, a missing TO means everyone, and a policy scoped only to other roles
 * (service_role, anon) does not count, because it cannot back a write made with a user's JWT.
 */
export function replayPoliciesFromSql(sql: string): Map<string, Set<string>> {
  const code = sql.replace(/--[^\n]*/g, "");
  const live = new Map<string, { table: string; cmd: string }>();
  for (const statement of code.split(";")) {
    const m =
      /(create|drop)\s+policy\s+(?:if\s+exists\s+)?(?:"([^"]+)"|(\w+))\s+on\s+(?:public\.)?(\w+)([\s\S]*)$/i.exec(
        statement,
      );
    if (!m) continue;
    const [, verb, quotedName, bareName, table, rest] = m;
    const key = `${table}.${quotedName ?? bareName}`;
    if (verb.toLowerCase() === "drop") {
      live.delete(key);
      continue;
    }
    const cmd = /\sfor\s+(\w+)/i.exec(rest)?.[1] ?? "ALL";
    const to = /\sto\s+([\w\s,]+?)(?=\s+(?:using|with)\b|$)/i.exec(rest)?.[1];
    if (to !== undefined && !CLIENT_ROLE.test(to)) {
      live.delete(key);
      continue;
    }
    live.set(key, { table, cmd: cmd.toUpperCase() });
  }
  const byTable = new Map<string, Set<string>>();
  for (const { table, cmd } of live.values()) {
    const set = byTable.get(table) ?? new Set<string>();
    for (const c of cmd === "ALL" ? ["SELECT", "INSERT", "UPDATE", "DELETE"] : [cmd]) set.add(c);
    byTable.set(table, set);
  }
  return byTable;
}

/** The policies of every migration in supabase/migrations (optionally leaving one file out), in order. */
export function replayPolicies(options: { exceptFile?: string } = {}): Map<string, Set<string>> {
  const sql = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql") && f !== options.exceptFile)
    .sort()
    .map((f) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8"))
    .join("\n");
  return replayPoliciesFromSql(sql);
}
