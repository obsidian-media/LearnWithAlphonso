import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * admin_numbers_growth and the replaced admin_numbers_own (20261127130000), EXECUTED in a real Postgres (PGlite) over
 * seeded rows, as the roles that matter.
 */
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const OWN_SQL = read("20261118100000_admin_numbers_own.sql");
const GROWTH_SQL = read("20261127130000_admin_numbers_growth.sql");

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const D = (back: number) => `((now() AT TIME ZONE 'UTC')::date - ${back})`;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, created_at timestamptz NOT NULL, display_name text);
    CREATE TABLE public.learning_days (user_id uuid NOT NULL, day date NOT NULL, PRIMARY KEY (user_id, day));
    CREATE TABLE public.lesson_completions (user_id uuid, completed_at timestamptz, language text NOT NULL DEFAULT 'en',
      correct int NOT NULL DEFAULT 0, total int NOT NULL DEFAULT 0);
    CREATE TABLE public.story_progress (user_id uuid, story_id uuid, completed_at timestamptz);
    CREATE TABLE public.practice_calls (user_id uuid, started_at timestamptz);
    CREATE TABLE public.podcast_playback (user_id uuid, completed_at timestamptz);
    CREATE TABLE public.user_progress (user_id uuid, streak int, last_active_date date);
    CREATE TABLE public.content_reports (id serial);
    CREATE TABLE public.support_conversations (id serial, status text);
    CREATE TABLE public.ai_usage (user_id uuid, day date, kind text, count int);
  `);
  await db.exec(`
    -- New learners: 3 today (u1-u3), 2 in the 7 days before the last 7 (u4,u5), plus an old one.
    INSERT INTO public.profiles (id, created_at) VALUES
      ('${u(1)}', now()), ('${u(2)}', now()), ('${u(3)}', now()),
      ('${u(4)}', now() - interval '3 days'),
      ('${u(5)}', now() - interval '9 days'), ('${u(6)}', now() - interval '10 days'),
      ('${u(7)}', now() - interval '60 days');
    -- Activity: u1 today and yesterday, u2 today only, u7 today after 20 quiet days (reactivated), u3 today after 5 quiet
    -- days (NOT reactivated), u4 today with no earlier history at all (NOT reactivated), u5 8 days ago.
    INSERT INTO public.learning_days VALUES
      ('${u(1)}', ${D(0)}), ('${u(1)}', ${D(1)}), ('${u(2)}', ${D(0)}),
      ('${u(7)}', ${D(0)}), ('${u(7)}', ${D(21)}),
      ('${u(3)}', ${D(0)}), ('${u(3)}', ${D(6)}),
      ('${u(4)}', ${D(0)}),
      ('${u(5)}', ${D(8)}), ('${u(6)}', ${D(9)});
    -- Lessons: today u1 perfect (en), u2 not perfect (es), u3 perfect (en); last week u1 perfect, a zero-total row.
    INSERT INTO public.lesson_completions (user_id, completed_at, language, correct, total) VALUES
      ('${u(1)}', now(), 'en', 10, 10), ('${u(2)}', now(), 'es', 7, 10), ('${u(3)}', now(), 'en', 5, 5),
      ('${u(1)}', now() - interval '3 days', 'en', 10, 10),
      ('${u(1)}', now() - interval '3 days', 'fr', 0, 0),
      ('${u(5)}', now() - interval '9 days', 'fr', 3, 10), ('${u(6)}', now() - interval '10 days', 'fr', 4, 8);
    INSERT INTO public.story_progress VALUES
      ('${u(1)}', '${u(100)}', now()), ('${u(2)}', '${u(100)}', now() - interval '2 days'),
      ('${u(3)}', '${u(101)}', NULL),
      ('${u(5)}', '${u(100)}', now() - interval '10 days');
  `);
  await db.exec(OWN_SQL);
  await db.exec(GROWTH_SQL);
}, 120_000);
afterAll(async () => db.close());

type Growth = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const growth = async (days: number) =>
  (await db.query<{ r: Growth }>(`SELECT public.admin_numbers_growth(${days}) AS r`)).rows[0]!.r;
const own = async (days: number) =>
  (await db.query<{ r: Growth }>(`SELECT public.admin_numbers_own(${days}) AS r`)).rows[0]!.r;

describe("admin_numbers_growth", () => {
  it("counts the window and the equal window right before it", async () => {
    const g = await growth(7);
    expect(g.storiesRead).toBe(2); // the draft (NULL) and the 10-day-old one are out
    expect(g.storiesPrev).toBe(1);
    expect(g.newPrev).toBe(2); // u5, u6 joined 9 and 10 days ago: inside the 7 days before the last 7
    expect(g.lessonsPrev).toBe(2);
    expect(g.activePrev).toBe(2); // u5 (8 days ago) and u6 (9 days ago)
  });
  it("matches admin_numbers_own over the same window (same definitions, so a change is comparable)", async () => {
    const o = await own(7);
    // current = own; the previous window is the same measure shifted back by the window length
    expect(o.newWindow).toBe(4);
    expect(o.lessons).toBe(5);
    expect(o.activeWindow).toBe(5);
  });
  it("perfect lessons is the share of lessons with correct = total, ignoring rows with no questions", async () => {
    // window 7: today 3 rows (2 perfect of 3) + last week one perfect (the 0/0 row has total 0 and is ignored) -> 3 of 4
    expect((await growth(7)).perfectPct).toBe(75);
    // today only: 2 of 3
    expect((await growth(1)).perfectPct).toBe(66.7);
  });
  it("perfect lessons is NULL, not 0, when no lesson was finished in the window", async () => {
    await db.exec("BEGIN; DELETE FROM public.lesson_completions;");
    try {
      expect((await growth(7)).perfectPct).toBeNull();
      expect((await growth(7)).byCourse).toEqual([]);
    } finally {
      await db.exec("ROLLBACK");
    }
  });
  it("counts distinct learners per course, largest first", async () => {
    expect((await growth(7)).byCourse).toEqual([
      { language: "en", learners: 2 },
      { language: "es", learners: 1 },
      { language: "fr", learners: 1 },
    ]);
    expect((await growth(1)).byCourse).toEqual([
      { language: "en", learners: 2 },
      { language: "es", learners: 1 },
    ]);
  });
  it("reactivated = active today after a gap of more than 14 days, with earlier activity", async () => {
    // u7 only: u3 was quiet 5 days, u4 has no earlier day, u1 was active yesterday
    expect((await growth(7)).reactivated).toBe(1);
    expect((await growth(90)).reactivated).toBe(1); // not window-dependent
  });
  it("the DAU series has one point per UTC day, from the first activity day, counting distinct learners", async () => {
    const s = (await growth(7)).dauSeries as { day: string; active: number }[];
    expect(s).toHaveLength(7);
    expect(s[6]!.active).toBe(5); // u1, u2, u3, u4, u7 today
    expect(s[5]!.active).toBe(1); // u1 yesterday
    expect(new Set(s.map((p) => p.day)).size).toBe(7);
    expect(s.map((p) => p.day)).toEqual([...s.map((p) => p.day)].sort());
    // a longer window shows 30 days, but never before the first row (21 days ago), so 22 points, not 30
    const long = (await growth(30)).dauSeries as unknown[];
    expect(long).toHaveLength(22);
  });
  it("leaves out days before any data exists, and the series is empty with no activity at all", async () => {
    await db.exec("BEGIN; DELETE FROM public.learning_days;");
    try {
      const g = await growth(7);
      expect(g.dauSeries).toEqual([]);
      expect(g.reactivated).toBe(0); // a real count of nobody, the source answered
    } finally {
      await db.exec("ROLLBACK");
    }
  });
  it("a one-day window is today (UTC) and has no previous window to compare with", async () => {
    const g = await growth(1);
    expect(g.newPrev).toBeNull();
    expect(g.activePrev).toBeNull();
    expect(g.lessonsPrev).toBeNull();
    expect(g.storiesPrev).toBeNull();
    expect(g.storiesRead).toBe(1); // only today's
  });
  it("returns only aggregates: no learner id, name or email", async () => {
    expect(JSON.stringify(await growth(30))).not.toMatch(/00000000-0000|display_name|email/);
  });
  it("clamps an absurd or missing window instead of failing", async () => {
    expect((await growth(100000)).storiesRead).toBe(3);
    expect((await db.query(`SELECT public.admin_numbers_growth(NULL) AS r`)).rows).toHaveLength(1);
  });
});

describe("admin_numbers_own with a one-day window (replaced)", () => {
  it("1 day = today since midnight UTC, 7 and 30 are unchanged", async () => {
    expect((await own(1)).lessons).toBe(3);
    expect((await own(1)).newWindow).toBe(3);
    expect((await own(7)).lessons).toBe(5);
    expect((await own(30)).lessons).toBe(7);
  });
  it("keeps every key the page's strict parser needs", async () => {
    expect(Object.keys(await own(7)).sort()).toEqual(
      [
        "activeToday",
        "activeWindow",
        "aiByKind",
        "avgStreak",
        "lessons",
        "newToday",
        "newWindow",
        "openReports",
        "openTickets",
        "podcastsFinished",
        "practiceCalls",
        "retention",
      ].sort(),
    );
  });
});

describe("who may call them", () => {
  const can = async (role: string, fn: string) =>
    (
      await db.query<{ ok: boolean }>(
        `SELECT has_function_privilege('${role}', '${fn}', 'EXECUTE') AS ok`,
      )
    ).rows[0]!.ok;
  it("only service_role can execute either function; anon and authenticated are refused", async () => {
    for (const fn of [
      "public.admin_numbers_growth(integer)",
      "public.admin_numbers_own(integer)",
    ]) {
      expect(await can("service_role", fn), fn).toBe(true);
      expect(await can("anon", fn), fn).toBe(false);
      expect(await can("authenticated", fn), fn).toBe(false);
    }
  });
  it("authenticated and anon really get a permission error when they call it", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      try {
        await expect(db.query(`SELECT public.admin_numbers_growth(7)`)).rejects.toThrow(
          /permission denied/i,
        );
      } finally {
        await db.exec("RESET ROLE");
      }
    }
  });
  it("is SECURITY DEFINER with an empty search_path, and the predicates stay sargable", () => {
    expect(GROWTH_SQL).toMatch(/SECURITY DEFINER/);
    expect(GROWTH_SQL).toMatch(/SET search_path = ''/);
    // no date cast on an indexed timestamp column in the new function's filters
    const growthBody = GROWTH_SQL.slice(
      GROWTH_SQL.indexOf("CREATE FUNCTION public.admin_numbers_growth"),
    );
    expect(growthBody).not.toMatch(/\(\w+\.\w+ AT TIME ZONE 'UTC'\)::date/);
    expect(GROWTH_SQL).toMatch(/CREATE INDEX IF NOT EXISTS learning_days_day_idx/);
    expect(GROWTH_SQL).toMatch(/CREATE INDEX IF NOT EXISTS story_progress_completed_at_idx/);
  });
});
