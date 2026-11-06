import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { PODCAST_QUIZZES } from "@/data/podcast-quizzes";

/**
 * Every path that adds weekly XP keeps weekly_xp_totals (20261105100800) current. Weekly XP is the activity_days
 * sum, so the paths are the functions that write activity_days: the real apply_lesson_completion (lessons, through
 * complete-lesson and the web) and submit_podcast_quiz (podcast quiz) run here against PGlite. The scan below fails
 * when a new writer of activity_days, or any writer of weekly_xp_totals other than the trigger, appears, so it gets a
 * test here too.
 */
const dir = path.join(process.cwd(), "supabase/migrations");
const read = (f: string) => readFileSync(path.join(dir, f), "utf8");

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
    INSERT INTO auth.users VALUES ('${U1}'), ('${U2}');
    CREATE TABLE public.podcast_folders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL);
    CREATE TABLE public.podcast_episodes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), folder_id uuid NOT NULL REFERENCES public.podcast_folders(id),
      slug text NOT NULL, course text, published boolean NOT NULL DEFAULT false);
    CREATE TABLE public.user_progress (
      user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, streak integer NOT NULL DEFAULT 0,
      longest_streak integer NOT NULL DEFAULT 0, last_active_date date, hearts integer NOT NULL DEFAULT 5,
      hearts_refill_at timestamptz, streak_freezes integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.language_progress (
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, language text NOT NULL,
      xp integer NOT NULL DEFAULT 0, league_tier text NOT NULL DEFAULT 'bronze',
      updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, language));
    CREATE TABLE public.lesson_completions (
      user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, lesson_id text, language text,
      correct integer, total integer, xp_earned integer, UNIQUE (user_id, lesson_id));
    CREATE TABLE public.activity_days (
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, day date NOT NULL,
      xp_earned integer NOT NULL DEFAULT 0 CHECK (xp_earned >= 0), PRIMARY KEY (user_id, day));
    CREATE TABLE public.review_items (
      user_id uuid REFERENCES auth.users(id), item_key text, lesson_id text, level text, language text, ease real,
      interval_days integer, repetitions integer, due_on date, UNIQUE (user_id, item_key, language));
    CREATE TABLE public.friend_activity_events (user_id uuid REFERENCES auth.users(id), event_type text, payload jsonb);
    -- Only what 20261105100800 replaces needs to exist before it.
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, display_name text, country text, avatar_seed text);
    CREATE TABLE public.teams (id uuid PRIMARY KEY, name text, join_code text, visibility text, created_by uuid);
    CREATE TABLE public.team_members (team_id uuid, user_id uuid, joined_at timestamptz);
    CREATE FUNCTION public.get_cohort_weekly_xp(_cohort_id uuid, _week_start date)
      RETURNS TABLE(user_id uuid, xp integer) LANGUAGE sql AS $$ SELECT NULL::uuid, 0 WHERE false $$;
  `);
  const episodes: Record<string, string> = {};
  for (const quiz of PODCAST_QUIZZES) {
    const f = await db.query<{ id: string }>(
      "INSERT INTO public.podcast_folders (slug) VALUES ($1) RETURNING id",
      [quiz.folder],
    );
    const e = await db.query<{ id: string }>(
      "INSERT INTO public.podcast_episodes (folder_id, slug, course, published) VALUES ($1,$2,$3,true) RETURNING id",
      [f.rows[0]!.id, quiz.slug, quiz.course],
    );
    episodes[quiz.slug] = e.rows[0]!.id;
  }
  await db.exec(read("20261014100300_atomic_lesson_completion.sql"));
  await db.exec(read("20261104100100_lesson_completion_hits.sql"));
  await db.exec(read("20261104100200_podcast_quiz.sql"));
  await db.exec(read("20261104100300_podcast_quiz_seed.sql"));
  await db.exec(read("20261105100800_weekly_xp_totals.sql"));
  return { db, episodes };
}

const totals = async (db: PGlite) =>
  (
    await db.query<{ user_id: string; week_start: string; xp: number }>(
      "SELECT user_id, week_start::text, xp FROM public.weekly_xp_totals WHERE xp <> 0 ORDER BY 1, 2",
    )
  ).rows;
const activitySums = async (db: PGlite) =>
  (
    await db.query<{ user_id: string; week_start: string; xp: number }>(
      `SELECT user_id, (day - (extract(isodow from day)::int - 1))::text AS week_start, sum(xp_earned)::int AS xp
         FROM public.activity_days GROUP BY 1, 2 HAVING sum(xp_earned) <> 0 ORDER BY 1, 2`,
    )
  ).rows;

describe("every weekly-XP award updates weekly_xp_totals (real Postgres)", () => {
  let db: PGlite;
  let episodes: Record<string, string>;
  beforeEach(async () => {
    ({ db, episodes } = await setup());
  }, 120_000);

  it("a lesson completion (apply_lesson_completion)", async () => {
    const r = await db.query<{ result: { status: string } }>(
      `SELECT public.apply_lesson_completion($1::uuid,'en','u1l1','A1',current_date,'{}'::jsonb,$2::jsonb,
         '[]'::jsonb,'[]'::jsonb) AS result`,
      [
        U1,
        JSON.stringify({
          streak: 1,
          longest_streak: 1,
          last_active_date: new Date().toISOString().slice(0, 10),
          hearts: 5,
          hearts_refill_at: null,
          streak_freezes: 0,
          xp: 100,
          league_tier: "bronze",
          best_correct: 8,
          total: 8,
          best_xp: 100,
          day_xp: 100,
        }),
      ],
    );
    expect(r.rows[0]!.result.status).toBe("applied");
    const t = await totals(db);
    expect(t).toEqual([expect.objectContaining({ user_id: U1, xp: 100 })]);
    expect(t).toEqual(await activitySums(db));
  });

  it("a podcast quiz (submit_podcast_quiz), added on top of the day's lesson XP", async () => {
    const quiz = PODCAST_QUIZZES.find((q) => q.slug === "ordering-coffee-v2")!;
    const answers = quiz.questions.map((q) => ({ questionId: q.id, choiceIndex: q.answerIndex }));
    await db.query("INSERT INTO public.activity_days VALUES ($1, current_date, 25)", [U2]);
    const r = await db.query<{ r: { status: string; xpGain: number } }>(
      "SELECT public.submit_podcast_quiz($1::uuid,$2::uuid,$3::jsonb,now(),NULL,60) AS r",
      [U2, episodes[quiz.slug], JSON.stringify(answers)],
    );
    expect(r.rows[0]!.r).toMatchObject({ status: "applied", xpGain: 70 });
    const t = await totals(db);
    expect(t).toEqual([expect.objectContaining({ user_id: U2, xp: 95 })]);
    expect(t).toEqual(await activitySums(db));
  });
});

describe("weekly XP writers", () => {
  /** The newest CREATE FUNCTION body for every public function, across all migrations. */
  const latest = new Map<string, string>();
  for (const f of readdirSync(dir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    for (const m of read(f).matchAll(
      /CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)\s*\([\s\S]*?\n\$(\w*)\$;/g,
    )) {
      latest.set(m[1]!, m[0]);
    }
  }

  it("finds the functions (guards against a silently empty scan)", () => {
    expect(latest.size).toBeGreaterThan(100);
  });

  it("only the two functions tested above write activity_days", () => {
    const writers = [...latest]
      .filter(([, body]) =>
        /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.activity_days\b/i.test(body),
      )
      .map(([name]) => name)
      .sort();
    expect(writers).toEqual(["apply_lesson_completion", "submit_podcast_quiz"]);
  });

  it("only the trigger writes weekly_xp_totals", () => {
    const writers = [...latest]
      .filter(([, body]) =>
        /(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.weekly_xp_totals\b/i.test(body),
      )
      .map(([name]) => name);
    expect(writers).toEqual(["_sync_weekly_xp_totals"]);
  });

  it("no app or Edge Function code writes activity_days or weekly_xp_totals directly", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          if (e.name !== "node_modules") walk(p);
        } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p);
      }
    };
    walk(path.join(process.cwd(), "src"));
    walk(path.join(process.cwd(), "supabase/functions"));
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.filter((f) =>
      /from\(\s*["'](activity_days|weekly_xp_totals)["']\s*\)\s*\.(insert|update|upsert|delete)\b/.test(
        readFileSync(f, "utf8").replace(/\s+/g, " "),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
