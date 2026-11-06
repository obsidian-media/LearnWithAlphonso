import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Weekly XP totals (20261105100800), on real Postgres (PGlite). The live getters (get_leaderboard,
 * get_team_leaderboard, get_my_team, get_cohort_weekly_xp, weekly_xp) are loaded from the migrations that deployed
 * them and kept side by side as `old_*` copies, so every check compares the old answer with the new one on the same
 * data: once right after the backfill, and again after a run of mixed writes to activity_days that only the
 * trigger can keep up with.
 */
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

function deployedFunction(file: string, name: string): string {
  const m = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ).exec(read(file));
  if (!m) throw new Error(`${name} not found in ${file}`);
  return m[0];
}

const LIVE = {
  weekly_xp: "20260922030000_weekly_xp_helper.sql",
  get_leaderboard: "20260930080000_fix_get_leaderboard_weekly_xp_drift.sql",
  get_team_leaderboard: "20261013100200_team_leaderboard_hides_private_teams.sql",
  get_my_team: "20261008130500_team_integrity.sql",
  get_cohort_weekly_xp: "20260922050000_season_ladder.sql",
} as const;

/** The live body as `public.old_<name>`, calling `old_weekly_xp`. */
const oldCopy = (name: keyof typeof LIVE) =>
  deployedFunction(LIVE[name], name)
    .replace(`FUNCTION public.${name}(`, `FUNCTION public.old_${name}(`)
    .replaceAll("public.weekly_xp(", "public.old_weekly_xp(");

const MIGRATION_FILE = "20261105100800_weekly_xp_totals.sql";

const uid = (i: number) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`;
const ME = uid(1);
const N = 70;

/** Small deterministic generator, so a failure reproduces. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const FIXTURE = `
  CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('app.uid', true), '')::uuid $$;
  CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name text NOT NULL, country text, avatar_seed text);
  CREATE TABLE public.friendships (user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    friend_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, status text NOT NULL DEFAULT 'accepted',
    UNIQUE (user_id, friend_id));
  CREATE TABLE public.blocked_users (blocker uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    blocked uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, PRIMARY KEY (blocker, blocked));
  CREATE TABLE public.language_progress (user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    language text NOT NULL, xp integer NOT NULL DEFAULT 0, PRIMARY KEY (user_id, language));
  CREATE TABLE public.lesson_completions (user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    language text NOT NULL, completed_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.activity_days (user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    day date NOT NULL, xp_earned integer NOT NULL DEFAULT 0 CHECK (xp_earned >= 0), PRIMARY KEY (user_id, day));
  CREATE INDEX ON public.activity_days(day);
  CREATE TABLE public.teams (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
    join_code text NOT NULL UNIQUE, visibility text NOT NULL, created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL);
  CREATE TABLE public.team_members (team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, joined_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (team_id, user_id), UNIQUE (user_id));
  CREATE TABLE public.team_weekly_rewards (team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
    week_start date NOT NULL, resolved_at timestamptz, PRIMARY KEY (team_id, week_start));
  CREATE TABLE public.season_cohort_members (cohort_id uuid NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, PRIMARY KEY (cohort_id, user_id));

  ${deployedFunction(LIVE.weekly_xp, "weekly_xp")}
  REVOKE ALL ON FUNCTION public.weekly_xp(uuid, date) FROM PUBLIC, anon, authenticated;
  ${deployedFunction(LIVE.get_leaderboard, "get_leaderboard")}
  ${deployedFunction(LIVE.get_team_leaderboard, "get_team_leaderboard")}
  ${deployedFunction(LIVE.get_my_team, "get_my_team")}
  ${deployedFunction(LIVE.get_cohort_weekly_xp, "get_cohort_weekly_xp")}
  ${oldCopy("weekly_xp")}
  ${oldCopy("get_leaderboard")}
  ${oldCopy("get_team_leaderboard")}
  ${oldCopy("get_my_team")}
  ${oldCopy("get_cohort_weekly_xp")}
`;

const COHORT = "00000000-0000-4000-8000-0000000c0001";

async function seed(db: PGlite) {
  const r = rng(42);
  const users = Array.from({ length: N }, (_, k) => uid(k + 1));
  await db.query(`INSERT INTO auth.users SELECT unnest($1::uuid[])`, [users]);
  for (const [k, id] of users.entries()) {
    await db.query("INSERT INTO public.profiles VALUES ($1, $2, $3, $4)", [
      id,
      `Learner ${k + 1}`,
      ["fr", "de", null][k % 3],
      `seed-${k}`,
    ]);
    await db.query("INSERT INTO public.language_progress VALUES ($1, 'en', $2), ($1, 'fr', $3)", [
      id,
      100 + k * 7,
      k % 4 === 0 ? 0 : 5 * k,
    ]);
    await db.query("INSERT INTO public.lesson_completions VALUES ($1, 'en', now())", [id]);
  }
  // Activity: this week (distinct totals for most learners, none for every 7th), last week, older weeks, and the
  // days just either side of each week boundary.
  const wk = `(current_date - ((extract(isodow from current_date)::int) - 1))`;
  for (const [k, id] of users.entries()) {
    if ((k + 1) % 7 !== 0) {
      await db.query(
        `INSERT INTO public.activity_days VALUES ($1, ${wk}, $2), ($1, ${wk} + 6, $3)
         ON CONFLICT DO NOTHING`,
        [id, 400 + k * 11, k % 5],
      );
    }
    await db.query(
      `INSERT INTO public.activity_days VALUES ($1, ${wk} - 1, $2), ($1, ${wk} - 7, $3), ($1, ${wk} - 40, $4)
       ON CONFLICT DO NOTHING`,
      [id, Math.floor(r() * 90), Math.floor(r() * 90), Math.floor(r() * 90)],
    );
  }
  // ME has friends, blocks one learner and is blocked by another.
  for (const f of [2, 3, 4, 5, 7, 14, 21]) {
    await db.query("INSERT INTO public.friendships VALUES ($1, $2, 'accepted')", [ME, uid(f)]);
  }
  await db.query("INSERT INTO public.friendships VALUES ($1, $2, 'pending')", [ME, uid(9)]);
  await db.query("INSERT INTO public.blocked_users VALUES ($1, $2), ($3, $1)", [
    ME,
    uid(5),
    uid(6),
  ]);
  // Teams: public, private with ME, private without ME, and one whose members earned nothing.
  for (let t = 0; t < 8; t++) {
    const visibility = t === 6 ? "private" : t === 7 ? "private" : "public";
    const team = await db.query<{ id: string }>(
      "INSERT INTO public.teams (name, join_code, visibility, created_by) VALUES ($1, $2, $3, $4) RETURNING id",
      [`Team ${t}`, `CODE${t}`, visibility, uid(t + 1)],
    );
    for (let m = t * 8 + 1; m <= t * 8 + 8 && m <= N; m++) {
      if (t === 7 && m !== 57) continue;
      await db.query("INSERT INTO public.team_members (team_id, user_id) VALUES ($1, $2)", [
        team.rows[0]!.id,
        uid(m),
      ]);
    }
  }
  for (let i = 1; i <= N; i += 3) {
    await db.query("INSERT INTO public.season_cohort_members VALUES ($1, $2)", [COHORT, uid(i)]);
  }
}

type Row = Record<string, unknown>;
const canonical = (rows: Row[]) =>
  [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

async function asUser(db: PGlite, user: string, sql: string, params: unknown[] = []) {
  await db.exec(`SET app.uid = '${user}'`);
  return (await db.query<Row>(sql, params)).rows;
}

/** Same rows (ties may come back in any order); ordered by the score column like the old function. */
function expectSameBoard(oldRows: Row[], newRows: Row[], score: string, full: boolean) {
  expect(newRows.length).toBe(oldRows.length);
  const scores = newRows.map((r) => r[score] as number);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
  expect(scores).toEqual(oldRows.map((r) => r[score] as number));
  if (full) {
    expect(canonical(newRows)).toEqual(canonical(oldRows));
  } else {
    // A full page of 50 that ends in zero-XP learners: which of the many zero rows fill it is arbitrary in both.
    const positive = (rows: Row[]) => canonical(rows.filter((r) => (r[score] as number) > 0));
    expect(positive(newRows)).toEqual(positive(oldRows));
  }
}

async function compareAllGetters(db: PGlite) {
  const viewers = [ME, uid(3), uid(13), uid(57)];
  const results: Record<string, number> = {};
  for (const viewer of viewers) {
    for (const scope of ["global", "friends", "country"]) {
      for (const period of ["weekly", "alltime"]) {
        const sql = (fn: string) => `SELECT * FROM public.${fn}($1, $2)`;
        const before = await asUser(db, viewer, sql("old_get_leaderboard"), [scope, period]);
        const after = await asUser(db, viewer, sql("get_leaderboard"), [scope, period]);
        expectSameBoard(before, after, "xp", before.length < 50 || before.every((r) => r.xp));
        if (viewer === ME) results[`${scope}/${period}`] = after.length;
      }
    }
    const tb = await asUser(db, viewer, "SELECT * FROM public.old_get_team_leaderboard()");
    const ta = await asUser(db, viewer, "SELECT * FROM public.get_team_leaderboard()");
    expectSameBoard(tb, ta, "weekly_xp", true);

    // get_my_team pays last week's winning team once, so each version runs in its own rolled-back transaction.
    const runMyTeam = async (fn: string) => {
      await db.exec("BEGIN");
      try {
        const rows = await asUser(db, viewer, `SELECT * FROM public.${fn}()`);
        const rewards = (
          await db.query("SELECT team_id, week_start FROM public.team_weekly_rewards")
        ).rows;
        const xp = (await db.query("SELECT user_id, language, xp FROM public.language_progress"))
          .rows;
        return { rows, rewards: canonical(rewards as Row[]), xp: canonical(xp as Row[]) };
      } finally {
        await db.exec("ROLLBACK");
      }
    };
    expect(await runMyTeam("get_my_team")).toEqual(await runMyTeam("old_get_my_team"));
  }
  for (const when of ["wk", "wk - 7", "wk - 42", "wk + 2", "wk - 3"]) {
    const d = `(SELECT current_date - ((extract(isodow from current_date)::int) - 1) AS wk) s`;
    const date = (await db.query<{ d: string }>(`SELECT (${when})::text AS d FROM ${d}`)).rows[0]!
      .d;
    const cb = await db.query<Row>("SELECT * FROM public.old_get_cohort_weekly_xp($1, $2)", [
      COHORT,
      date,
    ]);
    const ca = await db.query<Row>("SELECT * FROM public.get_cohort_weekly_xp($1, $2)", [
      COHORT,
      date,
    ]);
    expect(canonical(ca.rows)).toEqual(canonical(cb.rows));
    const wb = await db.query<Row>(
      "SELECT p.id, public.old_weekly_xp(p.id, $1) AS xp FROM public.profiles p ORDER BY p.id",
      [date],
    );
    const wa = await db.query<Row>(
      "SELECT p.id, public.weekly_xp(p.id, $1) AS xp FROM public.profiles p ORDER BY p.id",
      [date],
    );
    expect(wa.rows).toEqual(wb.rows);
  }
  return results;
}

/** weekly_xp_totals must hold exactly the per-week sums of activity_days (zero rows allowed). */
async function expectTotalsMatchActivity(db: PGlite) {
  const { rows } = await db.query<Row>(`
    SELECT coalesce(a.user_id, t.user_id) AS user_id, coalesce(a.week_start, t.week_start) AS week_start,
           a.xp AS activity, t.xp AS stored
      FROM (SELECT user_id, day - (extract(isodow from day)::int - 1) AS week_start, sum(xp_earned)::int AS xp
              FROM public.activity_days GROUP BY 1, 2) a
      FULL JOIN public.weekly_xp_totals t ON t.user_id = a.user_id AND t.week_start = a.week_start
     WHERE coalesce(a.xp, 0) <> coalesce(t.xp, 0)`);
  expect(rows).toEqual([]);
}

describe("weekly XP totals (real Postgres)", () => {
  let db: PGlite;
  let resultSizes: Record<string, number>;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(FIXTURE);
    await seed(db);
    expect(existsSync(path.join(process.cwd(), "supabase/migrations", MIGRATION_FILE))).toBe(true);
    await db.exec(read(MIGRATION_FILE));
  }, 240_000);

  it("backfills every user-week from activity_days", async () => {
    await expectTotalsMatchActivity(db);
    const { rows } = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.weekly_xp_totals",
    );
    expect(rows[0]!.n).toBeGreaterThan(N * 2);
  });

  it("every getter returns what it returned before, for several viewers, scopes and weeks", async () => {
    resultSizes = await compareAllGetters(db);
    // The boards are not trivially empty: the global weekly board is a full page of distinct scores.
    expect(resultSizes["global/weekly"]).toBe(50);
    expect(resultSizes["friends/weekly"]).toBeGreaterThan(2);
  }, 120_000);

  it("keeps the same columns and types", async () => {
    const { rows } = await db.query<Row>(`
      SELECT p.proname, pg_get_function_result(p.oid) AS result
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('get_leaderboard', 'old_get_leaderboard', 'get_team_leaderboard',
           'old_get_team_leaderboard', 'get_my_team', 'old_get_my_team', 'get_cohort_weekly_xp',
           'old_get_cohort_weekly_xp', 'weekly_xp', 'old_weekly_xp')`);
    const resultOf = new Map(rows.map((r) => [r.proname, r.result]));
    for (const fn of Object.keys(LIVE)) {
      expect(resultOf.get(fn), fn).toBe(resultOf.get(`old_${fn}`));
    }
  });

  it("stays equal after mixed writes: new days, increments, moved days, deletions and a deleted account", async () => {
    const r = rng(7);
    const wk = `(current_date - ((extract(isodow from current_date)::int) - 1))`;
    for (let step = 0; step < 300; step++) {
      const user = uid(1 + Math.floor(r() * N));
      const offset = Math.floor(r() * 30) - 20;
      const amount = Math.floor(r() * 60);
      const op = r();
      if (op < 0.5) {
        await db.query(
          `INSERT INTO public.activity_days VALUES ($1, ${wk} + $2::int, $3)
           ON CONFLICT (user_id, day) DO UPDATE SET xp_earned = public.activity_days.xp_earned + EXCLUDED.xp_earned`,
          [user, offset, amount],
        );
      } else if (op < 0.7) {
        await db.query(
          `UPDATE public.activity_days SET xp_earned = $3 WHERE user_id = $1 AND day = ${wk} + $2::int`,
          [user, offset, amount],
        );
      } else if (op < 0.85) {
        // Move one of the user's days to another (possibly different) week.
        await db.query(
          `UPDATE public.activity_days a SET day = a.day + $2::int
            WHERE a.user_id = $1 AND a.day = (SELECT min(day) FROM public.activity_days WHERE user_id = $1)
              AND NOT EXISTS (SELECT 1 FROM public.activity_days b WHERE b.user_id = $1 AND b.day = a.day + $2::int)`,
          [user, offset === 0 ? 3 : offset],
        );
      } else {
        await db.query(
          `DELETE FROM public.activity_days WHERE user_id = $1 AND day = ${wk} + $2::int`,
          [user, offset],
        );
      }
    }
    // A deleted account takes its activity and its totals with it.
    await db.query("DELETE FROM auth.users WHERE id = $1", [uid(44)]);
    expect(
      (await db.query("SELECT 1 FROM public.weekly_xp_totals WHERE user_id = $1", [uid(44)])).rows,
    ).toHaveLength(0);
    await expectTotalsMatchActivity(db);
    await compareAllGetters(db);
  }, 240_000);

  it("fills the weekly board with zero-XP learners when fewer than 50 earned XP this week", async () => {
    const wk = `(current_date - ((extract(isodow from current_date)::int) - 1))`;
    await db.exec(
      `DELETE FROM public.activity_days WHERE day >= ${wk} AND day < ${wk} + 7
         AND user_id IN (SELECT id FROM public.profiles ORDER BY id OFFSET 12)`,
    );
    await expectTotalsMatchActivity(db);
    const before = await asUser(
      db,
      ME,
      "SELECT * FROM public.old_get_leaderboard('global', 'weekly')",
    );
    const after = await asUser(db, ME, "SELECT * FROM public.get_leaderboard('global', 'weekly')");
    expect(after).toHaveLength(50);
    expect(after.filter((x) => (x.xp as number) > 0).length).toBeGreaterThan(5);
    expectSameBoard(before, after, "xp", false);
    // The zero rows are real, unblocked learners.
    const ids = new Set(after.map((x) => x.user_id));
    expect(ids.has(uid(5))).toBe(false);
    expect(ids.has(uid(6))).toBe(false);
    await compareAllGetters(db);
  }, 120_000);

  it("clients cannot read or write the totals, or call the trigger function", async () => {
    const { rows } = await db.query<Row>(`
      SELECT has_table_privilege('authenticated', 'public.weekly_xp_totals', 'SELECT') AS auth_select,
             has_table_privilege('anon', 'public.weekly_xp_totals', 'SELECT') AS anon_select,
             has_table_privilege('authenticated', 'public.weekly_xp_totals', 'INSERT') AS auth_insert,
             has_function_privilege('authenticated', 'public._sync_weekly_xp_totals()', 'EXECUTE') AS trig,
             has_function_privilege('authenticated', 'public.weekly_xp(uuid, date)', 'EXECUTE') AS helper,
             has_function_privilege('authenticated', 'public.get_leaderboard(text, text)', 'EXECUTE') AS board,
             has_function_privilege('anon', 'public.get_leaderboard(text, text)', 'EXECUTE') AS anon_board,
             has_function_privilege('authenticated', 'public.get_team_leaderboard()', 'EXECUTE') AS teams,
             has_function_privilege('authenticated', 'public.get_my_team()', 'EXECUTE') AS my_team,
             has_function_privilege('authenticated', 'public.get_cohort_weekly_xp(uuid, date)', 'EXECUTE') AS cohort`);
    expect(rows[0]).toEqual({
      auth_select: false,
      anon_select: false,
      auth_insert: false,
      trig: false,
      helper: false,
      board: true,
      anon_board: false,
      teams: true,
      my_team: true,
      cohort: false,
    });
  });
});

describe("the new getter queries use the weekly_xp_totals indexes (EXPLAIN)", () => {
  let db: PGlite;
  const migration = () => read(MIGRATION_FILE);
  /** A statement from the migration with its plpgsql variables bound to literals. */
  const bind = (sql: string, vars: Record<string, string>) =>
    Object.entries(vars).reduce((s, [k, v]) => s.replace(new RegExp(`\\b${k}\\b`, "g"), v), sql);
  const wk = "(current_date - ((extract(isodow from current_date)::int) - 1))";
  const plan = async (sql: string) => {
    const { rows } = await db
      .query<{ "QUERY PLAN": string }>(`EXPLAIN ${sql}`)
      .catch((e: Error) => {
        throw new Error(`${e.message} in: ${sql}`);
      });
    const text = rows.map((r) => r["QUERY PLAN"]).join("\n");
    if (process.env.SHOW_PLANS)
      appendFileSync(
        process.env.SHOW_PLANS,
        `${text}

`,
      );
    return text;
  };

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(FIXTURE);
    await db.exec(migration());
    // 5,000 learners with six weeks of totals each, 40 teams of 25.
    await db.exec(`
      INSERT INTO auth.users SELECT ('00000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid
        FROM generate_series(1, 5000) g;
      INSERT INTO public.profiles SELECT id, 'L', CASE WHEN random() < 0.5 THEN 'fr' END, NULL FROM auth.users;
      INSERT INTO public.weekly_xp_totals
        SELECT u.id, ${wk} - 7 * k, (random() * 900)::int + 1
          FROM auth.users u CROSS JOIN generate_series(0, 5) k;
      INSERT INTO public.teams (id, name, join_code, visibility)
        SELECT ('00000000-0000-4000-8000-1' || lpad(to_hex(g), 11, '0'))::uuid, 'T', 'C' || g, 'public'
          FROM generate_series(1, 40) g;
      INSERT INTO public.team_members (team_id, user_id)
        SELECT ('00000000-0000-4000-8000-1' || lpad(to_hex(1 + (g % 40)), 11, '0'))::uuid,
               ('00000000-0000-4000-8000-' || lpad(to_hex(g), 12, '0'))::uuid
          FROM generate_series(1, 1000) g;
      ANALYZE;
    `);
  }, 240_000);

  it("the weekly board reads this week's top totals from (week_start, xp)", async () => {
    const earners = /WITH earners AS \(([\s\S]*?)\n {4}\)\n {4}SELECT e\.id/.exec(migration())![1]!;
    const sql = bind(earners, {
      wk,
      me: `'${ME}'::uuid`,
      _scope: "'global'",
      my_country: "'fr'",
    });
    const text = await plan(sql);
    expect(text).toMatch(
      /Index (Only )?Scan using weekly_xp_totals_week_xp_idx on weekly_xp_totals/,
    );
    expect(text).not.toMatch(/Seq Scan on weekly_xp_totals/);
  });

  it("the team board and last week's winner read totals by index, not by scanning them", async () => {
    const team =
      /RETURN QUERY\n {2}(SELECT t\.id, t\.name, COALESCE\(SUM\(w\.xp\)[\s\S]*?LIMIT 50);/.exec(
        migration(),
      )![1]!;
    const winner = /SELECT t\.id INTO winner_team\n([\s\S]*?LIMIT 1);/.exec(migration())![1]!;
    for (const sql of [
      bind(team, { wk }).replaceAll("auth.uid()", `'${ME}'::uuid`),
      `SELECT t.id ${bind(winner, { prev_wk: `(${wk} - 7)` })}`,
    ]) {
      const text = await plan(sql);
      expect(text).toMatch(/Index (Only )?Scan using weekly_xp_totals_\w+ on weekly_xp_totals/);
      expect(text).not.toMatch(/Seq Scan on weekly_xp_totals/);
    }
  });
});
