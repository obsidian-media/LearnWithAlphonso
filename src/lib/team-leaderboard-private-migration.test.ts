import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const FILE = "20261013100200_team_leaderboard_hides_private_teams.sql";
const PREVIOUS = "20260922040000_teams.sql";
// The newest migration on main when this one was written (pinned so later merges cannot flip the test).
const MAIN_MAX_AT_AUTHORING = "20261013100100";

const read = (file: string) => fs.readFileSync(path.join(MIGRATIONS, file), "utf8");
const fn = (sql: string) => {
  const from = sql.indexOf("CREATE OR REPLACE FUNCTION public.get_team_leaderboard(");
  return sql.slice(from, sql.indexOf("$$;", from) + 3);
};
const code = (sql: string) => sql.replace(/--[^\n]*/g, "");

describe("team leaderboard hides private teams migration", () => {
  const sql = read(FILE);
  const filter = `  WHERE t.visibility = 'public'
     OR t.id IN (SELECT m.team_id FROM public.team_members m WHERE m.user_id = auth.uid())
`;

  it("sorts after main's newest at authoring, with a unique version", () => {
    expect(FILE.slice(0, 14) > MAIN_MAX_AT_AUTHORING).toBe(true);
    const versions = fs
      .readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.slice(0, 14));
    expect(versions.filter((v) => v === FILE.slice(0, 14))).toHaveLength(1);
  });

  it("shows public teams plus the caller's own team", () => {
    expect(fn(sql)).toContain(filter);
  });

  it("is the previous definition plus the visibility filter and nothing else", () => {
    expect(fn(sql).replace(filter, "")).toBe(fn(read(PREVIOUS)));
  });

  it("keeps SECURITY DEFINER, search_path, STABLE, return shape, the signed-out return and grants", () => {
    const body = fn(sql);
    expect(body).toContain("RETURNS TABLE(team_id uuid, name text, weekly_xp integer)");
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("STABLE");
    expect(body).toContain("SET search_path = public");
    expect(body).toContain("IF auth.uid() IS NULL THEN\n    RETURN;");
    expect(body).toContain("ORDER BY 3 DESC\n  LIMIT 50;");
    expect(code(sql)).toContain(
      "REVOKE ALL ON FUNCTION public.get_team_leaderboard() FROM PUBLIC, anon;",
    );
    expect(code(sql)).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_team_leaderboard() TO authenticated;",
    );
    expect(code(sql)).not.toMatch(/GRANT[^;]*\bTO\b[^;]*\b(anon|public)\b/i);
  });

  it("says why it exists and how to roll back", () => {
    expect(sql).toMatch(/private team is join-by-code only/);
    expect(sql).toMatch(/Rollback[\s\S]*20260922040000_teams\.sql/);
  });
});
