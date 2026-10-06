import fs from "node:fs";
import path from "node:path";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../../supabase/migrations");

/**
 * Replays every CREATE / DROP POLICY in supabase/migrations in order and returns, per public table, the set of
 * commands (SELECT, INSERT, UPDATE, DELETE) some surviving policy covers (FOR ALL covers all four; a missing FOR
 * means ALL). It does not look at the TO clause, so it can over-report backing for a policy scoped to another role;
 * that errs towards a false failure of the guards built on it, never a false pass.
 */
export function replayPolicies(options: { exceptFile?: string } = {}): Map<string, Set<string>> {
  const sql = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql") && f !== options.exceptFile)
    .sort()
    .map((f) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8").replace(/--[^\n]*/g, ""))
    .join("\n");
  const live = new Map<string, { table: string; cmd: string }>();
  for (const m of sql.matchAll(
    /(create|drop)\s+policy\s+(?:if\s+exists\s+)?"?(\w+)"?\s+on\s+(?:public\.)?(\w+)(?:\s+as\s+\w+)?(?:\s+for\s+(\w+))?/gi,
  )) {
    const key = `${m[3]}.${m[2]}`;
    if (m[1].toLowerCase() === "drop") live.delete(key);
    else live.set(key, { table: m[3], cmd: (m[4] ?? "ALL").toUpperCase() });
  }
  const byTable = new Map<string, Set<string>>();
  for (const { table, cmd } of live.values()) {
    const set = byTable.get(table) ?? new Set<string>();
    for (const c of cmd === "ALL" ? ["SELECT", "INSERT", "UPDATE", "DELETE"] : [cmd]) set.add(c);
    byTable.set(table, set);
  }
  return byTable;
}
