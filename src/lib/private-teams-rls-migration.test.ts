import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const FILE = "20261013100300_private_teams_row_visibility.sql";
// The newest migration on main when this one was written, and the leaderboard fix it follows (pinned so later
// merges cannot flip the test).
const MAIN_MAX_AT_AUTHORING = "20261013100100";
const LEADERBOARD_FIX = "20261013100200";

const sql = fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8");
const code = sql.replace(/--[^\n]*/g, "");
const flat = code.replace(/\s+/g, " ");

describe("private teams row visibility migration", () => {
  it("sorts after main's newest and the leaderboard fix, with a unique version", () => {
    const files = fs.readdirSync(MIGRATIONS);
    // Both pinned predecessors really exist, so this file applies after them (the comparisons below then mean something).
    expect(files.some((f) => f.startsWith(MAIN_MAX_AT_AUTHORING))).toBe(true);
    expect(files.some((f) => f.startsWith(LEADERBOARD_FIX))).toBe(true);
    expect(FILE.slice(0, 14) > MAIN_MAX_AT_AUTHORING).toBe(true);
    expect(FILE.slice(0, 14) > LEADERBOARD_FIX).toBe(true);
    const versions = files.filter((f) => f.endsWith(".sql")).map((f) => f.slice(0, 14));
    expect(versions.filter((v) => v === FILE.slice(0, 14))).toHaveLength(1);
  });

  it("replaces the two open policies and removes nothing else", () => {
    expect(code).toContain('DROP POLICY "teams_select_all" ON public.teams;');
    expect(code).toContain('DROP POLICY "team_members_select_all" ON public.team_members;');
    expect(code.match(/DROP POLICY/g)).toHaveLength(2);
    expect(code).not.toMatch(/USING \(true\)/i);
  });

  it("pins the teams policy: public teams, or the caller's own team", () => {
    expect(flat).toContain(
      `CREATE POLICY "teams_select_visible" ON public.teams FOR SELECT TO authenticated USING (visibility = 'public' OR id = (SELECT public._my_team_id()));`,
    );
  });

  it("pins the team_members policy: only the caller's own team", () => {
    expect(flat).toContain(
      `CREATE POLICY "team_members_select_own_team" ON public.team_members FOR SELECT TO authenticated USING (team_id = (SELECT public._my_team_id()));`,
    );
  });

  it("looks the caller's team up in a SECURITY DEFINER helper, so the policies cannot recurse", () => {
    expect(flat).toContain(
      "CREATE OR REPLACE FUNCTION public._my_team_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT tm.team_id FROM public.team_members tm WHERE tm.user_id = auth.uid() $$;",
    );
    expect(code).toContain("REVOKE ALL ON FUNCTION public._my_team_id() FROM PUBLIC, anon;");
    expect(code).toContain("GRANT EXECUTE ON FUNCTION public._my_team_id() TO authenticated;");
    expect(code).not.toMatch(/GRANT[^;]*\bTO\b[^;]*\b(anon|public)\b/i);
  });

  it("changes no table privileges, only policies", () => {
    expect(code).not.toMatch(/\b(GRANT|REVOKE)\b[^;]*ON (TABLE )?public\.team(s|_members)\b/i);
    expect(code).not.toMatch(/ALTER TABLE/i);
  });

  it("says why it exists and how to roll back", () => {
    expect(sql).toMatch(/private team is join-by-code only/);
    expect(sql).toMatch(/Rollback:[\s\S]*teams_select_all[\s\S]*team_members_select_all/);
  });
});
