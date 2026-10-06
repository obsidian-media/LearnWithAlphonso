import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");
const FILE = "20261006150000_team_missions.sql";

describe("team missions migration", () => {
  const sql = () => fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8");
  const code = () => sql().replace(/--[^\n]*/g, "");

  it("runs after the latest privilege migration", () => {
    expect(FILE.slice(0, 14) > "20261006140000").toBe(true);
  });

  it("keeps the spec's constants: 4 lessons per member, minimum 2 members, +50 XP", () => {
    expect(code()).toMatch(/members\s*\*\s*4\b/i);
    expect(code()).toMatch(/members\s*>=\s*2\b/i);
    expect(code()).toMatch(/\b50\b/);
  });

  it("team_missions is server-only: marker, no client grant, RLS on", () => {
    expect(sql()).toMatch(/--\s*client-grants:\s*none\s+public\.team_missions\b/i);
    expect(code()).toMatch(/ALTER TABLE public\.team_missions ENABLE ROW LEVEL SECURITY/i);
    expect(code()).not.toMatch(
      /GRANT[^;]*ON public\.team_missions[^;]*TO[^;]*\b(authenticated|anon)\b/i,
    );
  });

  it("team_mission_rewards lets a member read only their own rows (export needs it) and nothing else", () => {
    expect(code()).toMatch(
      /CREATE POLICY team_mission_rewards_select_own ON public\.team_mission_rewards FOR SELECT TO authenticated USING \(\(SELECT auth\.uid\(\)\) = user_id\)/i,
    );
    expect(code()).toMatch(/GRANT SELECT ON public\.team_mission_rewards TO authenticated/i);
    expect(code()).not.toMatch(
      /GRANT[^;]*(INSERT|UPDATE|DELETE|ALL)[^;]*ON public\.team_mission_rewards[^;]*TO[^;]*authenticated/i,
    );
    const aboutRewards = code()
      .split(";")
      .filter((statement) => /team_mission_rewards/i.test(statement));
    for (const statement of aboutRewards) expect(statement).not.toMatch(/\banon\b/i);
  });

  it("counts a member's lessons only from when they joined, and only this week", () => {
    expect(code()).toMatch(/GREATEST\(\s*_wk::timestamptz\s*,\s*tm\.joined_at\s*\)/i);
    expect(code()).toMatch(/lc\.completed_at\s*<\s*\(_wk \+ 7\)::timestamptz/i);
  });

  it("pays at most once per team-week with an atomic guard", () => {
    expect(code()).toMatch(/SET rewarded_at = now\(\)[\s\S]*?rewarded_at IS NULL/i);
    expect(code()).toMatch(/IF NOT FOUND THEN\s+RETURN;/i);
  });

  it("pays the course the member actually studied, never profiles.active_language (nothing writes it, so it is always en)", () => {
    expect(code()).not.toMatch(/active_language/i);
    const payout = code().match(/UPDATE public\.language_progress lp[\s\S]*?END;/i)?.[0] ?? "";
    expect(payout).toMatch(
      /lp\.language = \(\s*SELECT lc\.language\s+FROM public\.lesson_completions lc/i,
    );
    expect(payout).toMatch(/lc\.completed_at >= GREATEST\(_wk::timestamptz, tm\.joined_at\)/i);
  });

  it("reports a team below two members as needs_members before any other work (no snapshot, no payout, no false promise)", () => {
    const reader = code().match(/FUNCTION public\.get_team_mission[\s\S]*?\$\$;/i)?.[0] ?? "";
    expect(reader).toMatch(
      /IF members < 2 THEN\s+RETURN QUERY SELECT[^;]*'needs_members'[^;]*;\s+RETURN;\s+END IF;/i,
    );
    expect(reader.indexOf("IF members < 2 THEN")).toBeLessThan(reader.indexOf("_resolve_team_mission"));
  });

  it("never pays a team that has dropped below two members", () => {
    const resolver =
      code().match(/FUNCTION public\._resolve_team_mission[\s\S]*?\$\$;/i)?.[0] ?? "";
    expect(resolver).toMatch(/SELECT count\(\*\)[^;]*FROM public\.team_members[^;]*\) < 2/i);
  });

  it("only the public read function is executable by clients; helpers are not", () => {
    for (const fn of [
      "_team_mission_count\\(uuid, date, uuid\\)",
      "_resolve_team_mission\\(uuid, date\\)",
    ]) {
      expect(code()).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn} FROM PUBLIC, anon, authenticated`, "i"),
      );
    }
    expect(code()).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_team_mission\(\) FROM PUBLIC, anon/i,
    );
    expect(code()).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_team_mission\(\) TO authenticated/i,
    );
  });

  it("every function is SECURITY DEFINER with a pinned search_path", () => {
    const functions = code().match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/gi) ?? [];
    expect(functions).toHaveLength(3);
    for (const fn of functions) {
      expect(fn).toMatch(/SECURITY DEFINER/i);
      expect(fn).toMatch(/SET search_path = public/i);
    }
  });

  it("states how to undo it", () => {
    expect(sql()).toMatch(/ROLLBACK/i);
  });
});
