import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");
const FILE = "20261006170000_fix_team_joins_and_course_aware_payouts.sql";

/**
 * Two fixes in one migration, found while doing BACKLOG 0.0-af:
 *  1. `_join_team_impl` and `get_my_team` used an unqualified `team_id` while also returning a column called team_id,
 *     which plpgsql rejects at run time (42702). Nobody could create or join a team and a member could not load their
 *     team. (src/lib/plpgsql-output-column-clash.test.ts guards the whole class.)
 *  2. `get_weekly_challenges` and `get_my_team` paid XP on profiles.active_language, which nothing ever writes, so
 *     French and Spanish learners were recorded as paid and received nothing. They now pay the learner's current
 *     course: the language of their most recently completed lesson.
 * Every function below must be the deployed one plus exactly those changes and nothing else.
 */
describe("team joins and course-aware payouts migration", () => {
  const read = (f: string) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8");
  const code = (f: string) => read(f).replace(/--[^\n]*/g, "");
  const squash = (s: string) => s.replace(/\s+/g, " ").trim();
  const fn = (sql: string, name: string, args = "") =>
    sql.match(
      new RegExp(
        `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\(${args}\\)[\\s\\S]*?\\$\\$;`,
        "i",
      ),
    )?.[0] ?? "";

  const TZ_OLD = "SECURITY DEFINER\nSET search_path = public\n";
  const TZ_NEW = "SECURITY DEFINER\nSET search_path = public\nSET timezone = 'UTC'\n";
  const latestCourse = (user: string) => `(
          SELECT lc.language FROM public.lesson_completions lc
          WHERE lc.user_id = ${user} ORDER BY lc.completed_at DESC LIMIT 1
        )`;

  it("is the newest migration, so it runs after everything it replaces a function of", () => {
    const others = fs
      .readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql") && f !== FILE)
      .map((f) => f.slice(0, 14));
    expect(others.length).toBeGreaterThan(50);
    // The version is unique, and it sorts after every source file it copies a function from (a later migration may be
    // added after this one: this guards the order that matters, not "latest forever").
    expect(others).not.toContain(FILE.slice(0, 14));
    for (const source of [
      "20260930150000_fix_kicked_member_instant_rejoin.sql",
      "20260922030500_weekly_challenges.sql",
      "20260930110000_team_members_and_kick.sql",
      "20260920060000_v3_engagement_mechanics.sql",
    ]) {
      expect(FILE > source, source).toBe(true);
    }
  });

  it("no longer reads profiles.active_language anywhere", () => {
    expect(code(FILE)).not.toMatch(/active_language/i);
  });

  it("replaces exactly the four functions, each SECURITY DEFINER with its search_path", () => {
    const sql = code(FILE);
    expect(sql.match(/CREATE OR REPLACE FUNCTION/gi)).toHaveLength(4);
    const joinImpl = fn(sql, "_join_team_impl", "_team_id uuid, _me uuid");
    expect(joinImpl).not.toBe("");
    expect(joinImpl).toMatch(/SECURITY DEFINER/i);
    expect(joinImpl).toMatch(/SET search_path = public/i);
    for (const name of ["get_weekly_challenges", "get_my_team"]) {
      const f = fn(sql, name);
      expect(f, name).not.toBe("");
      expect(f, name).toMatch(/SECURITY DEFINER/i);
      expect(f, name).toMatch(/SET search_path = public/i);
      expect(f, name).toMatch(/SET timezone = 'UTC'/i);
    }
  });

  it("_join_team_impl is the deployed function with its two team_id references qualified, nothing else", () => {
    const original = fn(
      code("20260930150000_fix_kicked_member_instant_rejoin.sql"),
      "_join_team_impl",
      "_team_id uuid, _me uuid",
    );
    const expected = original
      .replace(
        "WHERE team_id = _team_id FOR UPDATE;",
        "WHERE team_members.team_id = _team_id FOR UPDATE;",
      )
      .replace(
        "INTO current_count FROM public.team_members WHERE team_id = _team_id;",
        "INTO current_count FROM public.team_members WHERE team_members.team_id = _team_id;",
      );
    expect(expected).not.toBe(original);
    expect(squash(fn(code(FILE), "_join_team_impl", "_team_id uuid, _me uuid"))).toBe(
      squash(expected),
    );
  });

  it("get_weekly_challenges is the deployed function plus exactly the course-aware payout", () => {
    const original = fn(code("20260922030500_weekly_challenges.sql"), "get_weekly_challenges");
    const expected = original
      .replace("  active_lang text;\n", "")
      .replace(
        "  SELECT p.active_language INTO active_lang FROM public.profiles p WHERE p.id = me;\n",
        "",
      )
      .replace(TZ_OLD, TZ_NEW)
      .replace(
        "UPDATE public.language_progress SET xp = xp + 100\n        WHERE user_id = me AND language = active_lang;",
        `UPDATE public.language_progress lp SET xp = lp.xp + 100\n        WHERE lp.user_id = me AND lp.language = ${latestCourse("me")};`,
      );
    expect(expected).not.toBe(original);
    expect(squash(fn(code(FILE), "get_weekly_challenges"))).toBe(squash(expected));
  });

  it("get_my_team is the deployed function plus exactly the qualified team_id and the course-aware payout", () => {
    const original = fn(code("20260930110000_team_members_and_kick.sql"), "get_my_team");
    const expected = original
      .replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")
      .replace(TZ_OLD, TZ_NEW)
      .replace(
        "SELECT 1 FROM public.team_weekly_rewards WHERE team_id = winner_team AND week_start = prev_wk",
        "SELECT 1 FROM public.team_weekly_rewards rw WHERE rw.team_id = winner_team AND rw.week_start = prev_wk",
      )
      .replace(
        "      FROM public.team_members tm3\n      JOIN public.profiles p ON p.id = tm3.user_id\n      WHERE tm3.team_id = winner_team\n        AND lp.user_id = tm3.user_id\n        AND lp.language = p.active_language;",
        `      FROM public.team_members tm3\n      WHERE tm3.team_id = winner_team\n        AND lp.user_id = tm3.user_id\n        AND lp.language = ${latestCourse("tm3.user_id")};`,
      );
    expect(expected).not.toBe(original.replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION"));
    expect(squash(fn(code(FILE), "get_my_team"))).toBe(squash(expected));
  });

  it("claim_weekly_quest is the deployed function with its one ambiguous xp read qualified, nothing else", () => {
    const args = "_quest_id text, _course text, _week_start date";
    const original = fn(
      code("20260920060000_v3_engagement_mechanics.sql"),
      "claim_weekly_quest",
      args,
    );
    const expected = original.replace(
      "SELECT xp INTO cur_xp FROM public.language_progress lp",
      "SELECT lp.xp INTO cur_xp FROM public.language_progress lp",
    );
    expect(expected).not.toBe(original);
    expect(squash(fn(code(FILE), "claim_weekly_quest", args))).toBe(squash(expected));
  });

  it("re-asserts who may call each function: the join helper nobody, the other two signed-in users only", () => {
    const sql = code(FILE);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\._join_team_impl\(uuid, uuid\) FROM PUBLIC, anon, authenticated/i,
    );
    expect(sql).not.toMatch(/GRANT[^;]*_join_team_impl/i);
    for (const name of ["get_weekly_challenges", "get_my_team"]) {
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(\\) FROM PUBLIC, anon`, "i"),
      );
      expect(sql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\(\\) TO authenticated`, "i"),
      );
    }
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.claim_weekly_quest\(text, text, date\) FROM PUBLIC, anon/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.claim_weekly_quest\(text, text, date\) TO authenticated, service_role/i,
    );
    expect(sql).not.toMatch(/\bTO anon\b/i);
  });

  it("states how to undo it", () => {
    expect(read(FILE)).toMatch(/ROLLBACK/i);
  });
});
