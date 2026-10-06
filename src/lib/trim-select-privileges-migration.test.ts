import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { replayPolicies } from "./__testutils__/policy-replay";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");
const FILE = "20261006140000_read_privileges_and_export_policies.sql";

/** Tables whose rows are public content: `anon` (not signed in) keeps SELECT on exactly these. */
const ANON_KEEPS = [
  "achievements",
  "lessons",
  "levels",
  "placement_questions",
  "questions",
  "scenarios",
  "units",
  "vocab_images",
  "weekly_quests",
];
/** Every table `anon` held SELECT on before this migration (live query, 2026-10-06). */
const ANON_HAD = [
  ...ANON_KEEPS,
  "activity_days",
  "ai_rate_limits",
  "ai_usage",
  "challenge_completions",
  "challenge_templates",
  "duel_queue",
  "duels",
  "friend_invite_codes",
  "friendships",
  "language_progress",
  "lesson_completions",
  "podcast_episodes",
  "podcast_folders",
  "podcast_play_events",
  "podcast_playback",
  "podcast_transcripts",
  "profiles",
  "review_items",
  "season_cohort_members",
  "season_cohorts",
  "season_placements",
  "team_kicks",
  "team_members",
  "team_weekly_rewards",
  "teams",
  "user_achievements",
  "user_progress",
  "user_weekly_quest_claims",
  "weakness_events",
];
/** Tables with no policy and no client read path (only SECURITY DEFINER functions and the service role touch them). */
const AUTH_LOSES_SELECT = [
  "friend_invite_codes",
  "season_cohorts",
  "team_kicks",
  "team_weekly_rewards",
];
/** Export tables that had no SELECT policy: users could not read their own rows, so the GDPR export was empty. */
const OWN_ROW_POLICIES = [
  "challenge_completions",
  "duel_queue",
  "season_cohort_members",
  "season_placements",
];

describe("read privileges and export policies migration", () => {
  const sql = () => fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8");
  const statements = () =>
    sql()
      .replace(/--[^\n]*/g, "")
      .split(";")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  const revokes = (role: string) =>
    statements().filter((s) =>
      new RegExp(String.raw`^REVOKE SELECT ON public\.\w+ FROM ${role}$`).test(s),
    );

  it("runs after the previous privilege migration", () => {
    expect(FILE.slice(0, 14) > "20261006130000").toBe(true);
  });

  it("the anon list is the 38 tables it held, and the kept ones are exactly the public content tables", () => {
    expect(new Set(ANON_HAD).size).toBe(38);
    expect(ANON_KEEPS).toHaveLength(9);
  });

  it("revokes anon SELECT on every table it held except the public content tables, one statement each", () => {
    const expected = ANON_HAD.filter((t) => !ANON_KEEPS.includes(t)).map(
      (t) => `REVOKE SELECT ON public.${t} FROM anon`,
    );
    expect(revokes("anon").sort()).toEqual(expected.sort());
  });

  it("revokes authenticated SELECT only on the four tables nothing reads", () => {
    expect(revokes("authenticated").sort()).toEqual(
      AUTH_LOSES_SELECT.map((t) => `REVOKE SELECT ON public.${t} FROM authenticated`).sort(),
    );
  });

  it("adds an own-row SELECT policy for each export table that lacked one", () => {
    const policies = statements().filter((s) => /^CREATE POLICY/i.test(s));
    expect(policies).toHaveLength(OWN_ROW_POLICIES.length);
    for (const table of OWN_ROW_POLICIES) {
      const match = policies.find((s) =>
        new RegExp(String.raw`ON public\.${table} FOR SELECT TO authenticated USING`).test(s),
      );
      expect(match, table).toBeDefined();
      expect(match, table).toMatch(/\(\s*SELECT auth\.uid\(\)\s*\)\s*=\s*user_id/);
    }
  });

  it("contains nothing else (no GRANT, no write privileges, no service_role, no DROP)", () => {
    const known = statements().filter(
      (s) =>
        !/^REVOKE SELECT ON public\.\w+ FROM (anon|authenticated)$/.test(s) &&
        !/^CREATE POLICY/i.test(s),
    );
    expect(known).toEqual([]);
  });

  it("never takes SELECT from a table that has a policy for the signed-in user", () => {
    const policies = replayPolicies({ exceptFile: FILE });
    const problems = AUTH_LOSES_SELECT.filter((t) => policies.get(t)?.has("SELECT"));
    expect(problems).toEqual([]);
  });

  it("every table anon keeps has a SELECT policy that applies to anon (it really is public content)", () => {
    const policies = replayPolicies({ role: "anon" });
    const missing = ANON_KEEPS.filter((table) => !policies.get(table)?.has("SELECT"));
    expect(missing).toEqual([]);
  });

  it("states how to undo it", () => {
    expect(sql()).toMatch(/ROLLBACK/i);
  });
});
