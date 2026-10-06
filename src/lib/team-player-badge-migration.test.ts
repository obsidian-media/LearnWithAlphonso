import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");
const FILE = "20261006160000_team_player_badge.sql";

describe("team player badge migration", () => {
  const sql = () => fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8");
  const code = () => sql().replace(/--[^\n]*/g, "");
  const resolver = () =>
    code().match(/FUNCTION public\._resolve_team_mission[\s\S]*?\$\$;/i)?.[0] ?? "";

  it("runs after the team missions migration it replaces a function of", () => {
    expect(FILE.slice(0, 14) > "20261006150000").toBe(true);
  });

  it("adds exactly one achievement: team_player, category team, threshold 1", () => {
    const inserts = code().match(/INSERT INTO public\.achievements[\s\S]*?;/gi) ?? [];
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatch(/'team_player'/);
    expect(inserts[0]).toMatch(/'team'/);
    expect(inserts[0]).toMatch(/,\s*1\s*,/);
    expect(inserts[0]).toMatch(/ON CONFLICT[^;]*DO NOTHING/i);
  });

  it("grants the badge only to the members who were just paid, in the same payout, once", () => {
    const grant = resolver().match(/INSERT INTO public\.user_achievements[\s\S]*?;/i)?.[0] ?? "";
    expect(grant).toMatch(/FROM public\.team_mission_rewards r/i);
    expect(grant).toMatch(/r\.team_id = _team AND r\.week_start = _wk/i);
    expect(grant).toMatch(/'team_player'/);
    expect(grant).toMatch(/ON CONFLICT[^;]*DO NOTHING/i);
    // after the atomic rewarded_at guard, never before it
    expect(resolver().indexOf("INSERT INTO public.user_achievements")).toBeGreaterThan(
      resolver().indexOf("IF NOT FOUND THEN"),
    );
  });

  it("keeps everything the previous version of the resolver guaranteed", () => {
    expect(resolver()).toMatch(/SECURITY DEFINER/i);
    expect(resolver()).toMatch(/SET search_path = public/i);
    expect(resolver()).toMatch(/SET timezone = 'UTC'/i);
    expect(resolver()).toMatch(/rewarded_at IS NULL/i);
    expect(resolver()).toMatch(/\) < 2 THEN/);
    expect(resolver()).toMatch(/lp\.language = \(\s*SELECT lc\.language/i);
    expect(resolver()).not.toMatch(/active_language/i);
  });

  it("re-asserts the privileges CREATE OR REPLACE leaves alone, so nothing can widen", () => {
    expect(code()).toMatch(
      /REVOKE ALL ON FUNCTION public\._resolve_team_mission\(uuid, date\) FROM PUBLIC, anon, authenticated/i,
    );
    expect(code()).not.toMatch(/\bGRANT\b/i);
  });

  it("states how to undo it", () => {
    expect(sql()).toMatch(/ROLLBACK/i);
  });
});
