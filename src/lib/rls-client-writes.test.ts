import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { replayPolicies } from "./__testutils__/policy-replay";

/**
 * A write through the user's own RLS-scoped client (`supabase.from(...)`, not `supabaseAdmin`) only works if a
 * policy covers that command. completeLessonRemote inserted into friend_activity_events this way for weeks with
 * no INSERT policy: every web lesson completion that earned XP threw after saving progress and showed 0 XP, and
 * the unit test mocked the insert as a success. This guard reads the code and the policies instead.
 */
const SRC = path.resolve(import.meta.dirname, "..");
const WRITE_CALL =
  /\bsupabase\s*\.from\(\s*["'](\w+)["']\s*\)\s*\.(insert|update|upsert|delete)\b/g;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__testutils__" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}

const needs = (method: string) =>
  method === "upsert" ? ["INSERT", "UPDATE"] : [method.toUpperCase()];

describe("writes through the user's RLS client are backed by a policy", () => {
  const policies = replayPolicies();
  const files = [...sourceFiles(path.join(SRC, "lib")), ...sourceFiles(path.join(SRC, "routes"))];
  const calls = files.flatMap((file) =>
    [...fs.readFileSync(file, "utf8").matchAll(WRITE_CALL)].map((m) => ({
      file: path.relative(SRC, file).split(path.sep).join("/"),
      table: m[1],
      method: m[2],
    })),
  );

  it("finds the client writes it is meant to check (not vacuous)", () => {
    const tables = new Set(calls.map((c) => c.table));
    expect(tables.has("profiles")).toBe(true);
    expect(tables.has("content_reports")).toBe(true);
    expect(policies.get("profiles")?.has("UPDATE")).toBe(true);
    expect(files.length).toBeGreaterThan(30);
  });

  it("every such write has a policy for each command it needs", () => {
    const problems = calls.flatMap(({ file, table, method }) =>
      needs(method)
        .filter((cmd) => !policies.get(table)?.has(cmd))
        .map((cmd) => `${file}: supabase.from("${table}").${method} needs a ${cmd} policy`),
    );
    expect(problems).toEqual([]);
  });
});
