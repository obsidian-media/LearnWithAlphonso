import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * set_my_time_zone (20261126100000), EXECUTED in a real Postgres (PGlite) on top of 20261107120000. Supabase's default
 * grants are simulated BEFORE the migrations (anon and authenticated get EXECUTE on every new function), so the
 * REVOKE/GRANT assertions mean something.
 */
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticated; CREATE ROLE anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
    INSERT INTO auth.users VALUES ('${U1}'), ('${U2}');
    CREATE TABLE public.review_items(
      id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id),
      item_key text NOT NULL, language text NOT NULL, source text,
      weakness_label text, due_on date NOT NULL,
      last_reviewed_at timestamptz, ease real, interval_days integer, repetitions integer, lapses integer
    );
    CREATE TABLE public.weakness_events(user_id uuid NOT NULL, category text NOT NULL, event_type text NOT NULL);
    CREATE TABLE public.review_grade_attempts(
      user_id uuid NOT NULL, attempt_id text NOT NULL, item_key text NOT NULL, language text NOT NULL,
      result jsonb NOT NULL, PRIMARY KEY (user_id, attempt_id));
    CREATE TABLE public.language_progress(
      user_id uuid NOT NULL, language text NOT NULL, league_tier text NOT NULL DEFAULT 'bronze',
      PRIMARY KEY (user_id, language));
    CREATE TABLE public.weekly_xp_totals(user_id uuid NOT NULL, week_start date NOT NULL, xp integer NOT NULL,
      PRIMARY KEY (user_id, week_start));
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
  `);
  await db.exec(read("20261107120000_profile_data.sql"));
  await db.exec(read("20261126100000_learner_time_zone_self_write.sql"));
}, 120_000);
afterAll(async () => {
  await db.close();
});

const as = async <T>(uid: string | null, role: string, fn: () => Promise<T>) => {
  await db.exec(`SELECT set_config('app.uid', '${uid ?? ""}', false); SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE; SELECT set_config('app.uid', '', false)");
  }
};
const setMine = (tz: string | null) => db.query("SELECT public.set_my_time_zone($1)", [tz]);
const row = async (u: string) =>
  (
    await db.query<{ time_zone: string; updated_at: string }>(
      "SELECT time_zone, updated_at::text AS updated_at FROM public.learner_time_zones WHERE user_id=$1",
      [u],
    )
  ).rows;
const rejects = (p: Promise<unknown>, code: string) => expect(p).rejects.toMatchObject({ code });

describe("set_my_time_zone", () => {
  it("records the signed-in learner's own zone on first write, and replaces it", async () => {
    expect(await row(U1)).toEqual([]);
    await as(U1, "authenticated", () => setMine("Pacific/Auckland"));
    expect((await row(U1)).map((r) => r.time_zone)).toEqual(["Pacific/Auckland"]);
    await as(U1, "authenticated", () => setMine("America/Toronto"));
    expect((await row(U1)).map((r) => r.time_zone)).toEqual(["America/Toronto"]);
  });

  it("never writes another learner's row", async () => {
    expect(await row(U2)).toEqual([]);
  });

  it("refuses garbage, empty, null and over-long names (22023) and stores nothing for them", async () => {
    for (const bad of ["Mars/Olympus", "", "x".repeat(65), null]) {
      await as(U2, "authenticated", () => rejects(setMine(bad), "22023"));
    }
    expect(await row(U2)).toEqual([]);
  });

  it("is a no-op for an unchanged zone: the row is not touched", async () => {
    await as(U1, "authenticated", () => setMine("America/Toronto"));
    const before = await row(U1);
    await db.exec("SELECT pg_sleep(0.05)");
    await as(U1, "authenticated", () => setMine("America/Toronto"));
    expect(await row(U1)).toEqual(before);
  });

  it("needs a signed-in learner: no uid is 42501, anon cannot execute it, clients cannot call the writer", async () => {
    await as(null, "authenticated", () => rejects(setMine("Europe/Paris"), "42501"));
    const { rows } = await db.query<{ a: boolean; u: boolean; p: boolean }>(
      `SELECT has_function_privilege('anon','public.set_my_time_zone(text)','EXECUTE') AS a,
              has_function_privilege('authenticated','public.set_my_time_zone(text)','EXECUTE') AS u,
              has_function_privilege('authenticated','public.set_learner_time_zone(uuid,text)','EXECUTE') AS p`,
    );
    expect(rows[0]).toEqual({ a: false, u: true, p: false });
  });
});
