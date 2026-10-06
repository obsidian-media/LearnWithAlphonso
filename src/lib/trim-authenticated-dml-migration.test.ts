import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { replayPolicies } from "./__testutils__/policy-replay";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");
const FILE = "20261006130000_trim_authenticated_unbacked_dml.sql";

/**
 * BACKLOG 0.0-ae follow-up 1, docs/database-privileges.md. Per table, the INSERT/UPDATE/DELETE privileges that
 * `authenticated` held with NO policy behind them (audited against pg_policies on the live database, 2026-10-06,
 * and against every client write path). RLS already denied these, so removing them changes only the error
 * a client would see. SELECT is deliberately never listed: a table with no SELECT policy returns no rows today,
 * and revoking would turn that into a permission error for any client that still reads it.
 */
const EXPECTED: Record<string, string[]> = {
  achievements: ["DELETE", "INSERT", "UPDATE"],
  activity_days: ["DELETE"],
  ai_rate_limits: ["DELETE", "INSERT", "UPDATE"],
  ai_usage: ["DELETE", "INSERT", "UPDATE"],
  blocked_users: ["UPDATE"],
  challenge_completions: ["DELETE", "INSERT", "UPDATE"],
  challenge_templates: ["DELETE", "INSERT", "UPDATE"],
  content_reports: ["DELETE", "UPDATE"],
  duel_queue: ["DELETE", "INSERT", "UPDATE"],
  duels: ["DELETE", "INSERT", "UPDATE"],
  friend_activity_events: ["DELETE", "INSERT", "UPDATE"],
  friend_invite_codes: ["DELETE", "INSERT", "UPDATE"],
  friendships: ["UPDATE"],
  lessons: ["DELETE", "INSERT", "UPDATE"],
  levels: ["DELETE", "INSERT", "UPDATE"],
  nudges: ["DELETE"],
  placement_questions: ["DELETE", "INSERT", "UPDATE"],
  podcast_transcripts: ["DELETE", "INSERT", "UPDATE"],
  profiles: ["DELETE"],
  questions: ["DELETE", "INSERT", "UPDATE"],
  scenarios: ["DELETE", "INSERT", "UPDATE"],
  season_cohort_members: ["DELETE", "INSERT", "UPDATE"],
  season_cohorts: ["DELETE", "INSERT", "UPDATE"],
  season_placements: ["DELETE", "INSERT", "UPDATE"],
  team_kicks: ["DELETE", "INSERT", "UPDATE"],
  team_members: ["DELETE", "INSERT", "UPDATE"],
  team_weekly_rewards: ["DELETE", "INSERT", "UPDATE"],
  teams: ["DELETE", "INSERT", "UPDATE"],
  units: ["DELETE", "INSERT", "UPDATE"],
  user_progress: ["DELETE"],
  user_weekly_quest_claims: ["DELETE", "INSERT", "UPDATE"],
  vocab_images: ["DELETE", "INSERT", "UPDATE"],
  weakness_events: ["DELETE", "UPDATE"],
  weekly_quests: ["DELETE", "INSERT", "UPDATE"],
};

describe("trim authenticated's unbacked DML privileges", () => {
  const sql = () => fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8");
  const statements = () =>
    sql()
      .replace(/--[^\n]*/g, "")
      .split(";")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);

  it("runs after the previous privilege migration", () => {
    expect(FILE.slice(0, 14) > "20261006120000").toBe(true);
  });

  it("is exactly one REVOKE per audited table, with exactly the audited privileges, from authenticated only", () => {
    const expected = Object.entries(EXPECTED)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([table, privs]) => `REVOKE ${privs.join(", ")} ON public.${table} FROM authenticated`);
    const actual = [...statements()].sort((a, b) => a.localeCompare(b));
    expect(actual).toEqual(expected.sort((a, b) => a.localeCompare(b)));
  });

  it("never revokes SELECT, never touches anon or service_role, never grants", () => {
    const code = statements().join(";\n");
    expect(code).not.toMatch(/\bSELECT\b/i);
    expect(code).not.toMatch(/\banon\b|service_role|\bGRANT\b|\bALL\b/i);
  });

  it("never revokes a privilege that a policy created in the migrations depends on", () => {
    const policies = replayPolicies({ exceptFile: FILE });
    const problems: string[] = [];
    for (const [table, revoked] of Object.entries(EXPECTED)) {
      for (const privilege of revoked) {
        if (policies.get(table)?.has(privilege))
          problems.push(`${table}: a policy backs ${privilege}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("states how to undo it", () => {
    expect(sql()).toMatch(/ROLLBACK/i);
  });
});
