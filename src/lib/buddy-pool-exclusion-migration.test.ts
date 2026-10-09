import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buddyStatusMessage } from "./buddy";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const FILE = "20261013100100_buddy_pool_exclusion.sql";
const PREVIOUS = "20261008130700_buddy_matching_hardening.sql";
const VALIDATE = "20261013100000_podcast_published_licensed_validate.sql";
// The newest migration on main when this one was written (pinned so later merges cannot flip the test).
const MAIN_MAX_AT_AUTHORING = "20261012500200";

const read = (file: string) => fs.readFileSync(path.join(MIGRATIONS, file), "utf8");
const joinFn = (sql: string) => {
  const from = sql.indexOf("CREATE OR REPLACE FUNCTION public.join_buddy_pool(");
  return sql.slice(from, sql.indexOf("$$;", from) + 3);
};
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");

describe("buddy pool exclusion migration", () => {
  const sql = read(FILE);

  it("sorts after the podcast validation and after main's newest at authoring, with a unique version", () => {
    expect(FILE.slice(0, 14) > VALIDATE.slice(0, 14)).toBe(true);
    expect(FILE.slice(0, 14) > MAIN_MAX_AT_AUTHORING).toBe(true);
    const versions = fs
      .readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.slice(0, 14));
    expect(versions.filter((v) => v === FILE.slice(0, 14))).toHaveLength(1);
  });

  it("creates a server-only table: RLS on, no client policy, no client privilege", () => {
    expect(code(sql)).toMatch(
      /CREATE TABLE public\.buddy_pool_exclusions \(\s*user_id uuid PRIMARY KEY REFERENCES auth\.users\(id\) ON DELETE CASCADE/,
    );
    expect(code(sql)).toContain(
      "ALTER TABLE public.buddy_pool_exclusions ENABLE ROW LEVEL SECURITY;",
    );
    expect(code(sql)).toContain(
      "REVOKE ALL ON public.buddy_pool_exclusions FROM PUBLIC, anon, authenticated;",
    );
    expect(code(sql)).toContain("GRANT ALL ON public.buddy_pool_exclusions TO service_role;");
    expect(code(sql)).not.toMatch(/CREATE POLICY/);
    expect(code(sql)).not.toMatch(
      /GRANT[^;]*ON (TABLE )?public\.buddy_pool_exclusions[^;]*TO[^;]*\b(authenticated|anon|public)\b/i,
    );
    expect(sql).toMatch(/-- client-grants: none public\.buddy_pool_exclusions/);
  });

  it("changes only the exclusion checks in join_buddy_pool", () => {
    const guardBlock = `
  -- An excluded account (the App Review demo account) is never offered to a real learner: it gets the same
  -- answer as when matching is switched off, which every app build already renders.
  IF EXISTS (SELECT 1 FROM public.buddy_pool_exclusions x WHERE x.user_id = me) THEN
    RETURN QUERY SELECT 'matching_off'::text; RETURN;
  END IF;
`;
    const candidateLine =
      "      AND NOT EXISTS (SELECT 1 FROM public.buddy_pool_exclusions x WHERE x.user_id = p.user_id)\n";
    const after = joinFn(sql);
    expect(after).toContain(guardBlock);
    expect(after).toContain(candidateLine);
    expect(after.replace(guardBlock, "").replace(candidateLine, "")).toBe(joinFn(read(PREVIOUS)));
  });

  it("refuses an excluded caller with the kill-switch status the apps already render, before any write", () => {
    const body = joinFn(sql);
    const guard = body.indexOf("buddy_pool_exclusions x WHERE x.user_id = me");
    expect(guard).toBeGreaterThan(-1);
    expect(body.slice(guard, guard + 200)).toContain("'matching_off'");
    expect(guard).toBeLessThan(body.indexOf("INSERT INTO public.buddy_pool_attempts"));
    expect(buddyStatusMessage("matching_off")).not.toBe(buddyStatusMessage("not-a-status"));
  });

  it("never offers an excluded learner as a candidate, even if already in the pool", () => {
    const body = joinFn(sql);
    const select = body.slice(body.indexOf("SELECT p.user_id INTO candidate"));
    expect(select).toContain(
      "NOT EXISTS (SELECT 1 FROM public.buddy_pool_exclusions x WHERE x.user_id = p.user_id)",
    );
  });

  it("keeps SECURITY DEFINER, search_path, return shape and grants", () => {
    const body = joinFn(sql);
    expect(body).toContain("RETURNS TABLE(status text)");
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path = public");
    expect(code(sql)).toContain(
      "REVOKE ALL ON FUNCTION public.join_buddy_pool(text, boolean) FROM PUBLIC, anon;",
    );
    expect(code(sql)).toContain(
      "GRANT EXECUTE ON FUNCTION public.join_buddy_pool(text, boolean) TO authenticated;",
    );
  });

  it("says why it exists and how to roll back", () => {
    expect(sql).toMatch(/App Review demo account/);
    expect(sql).toMatch(/Rollback[\s\S]*DROP TABLE public\.buddy_pool_exclusions/);
  });

  it("introduces no new status, so the shared fixtures and app copy need no change", () => {
    const statuses = [...joinFn(sql).matchAll(/SELECT '([a-z_]+)'::text/g)].map((m) => m[1]);
    for (const status of new Set(statuses)) {
      expect(buddyStatusMessage(status), status).not.toBe(buddyStatusMessage("not-a-status"));
    }
  });
});
