import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const USER = "00000000-0000-4000-8000-000000000001";
const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261014100300_atomic_lesson_completion.sql"),
  "utf8",
);
const call = `SELECT public.apply_lesson_completion(
  $1::uuid,'en','u1l1','A1',current_date,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb
) AS result`;

describe("atomic lesson completion migration (real Postgres)", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.user_progress(
        user_id uuid PRIMARY KEY REFERENCES auth.users(id), streak integer,
        longest_streak integer, last_active_date date, hearts integer,
        hearts_refill_at timestamptz, streak_freezes integer,
        updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.language_progress(
        user_id uuid REFERENCES auth.users(id), language text, xp integer,
        league_tier text, updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(user_id,language));
      CREATE TABLE public.lesson_completions(
        user_id uuid REFERENCES auth.users(id), lesson_id text, language text,
        correct integer, total integer, xp_earned integer,
        UNIQUE(user_id,lesson_id));
      CREATE TABLE public.activity_days(
        user_id uuid REFERENCES auth.users(id), day date, xp_earned integer,
        PRIMARY KEY(user_id,day));
      CREATE TABLE public.review_items(
        user_id uuid REFERENCES auth.users(id), item_key text, lesson_id text,
        level text, language text, ease real, interval_days integer,
        repetitions integer, due_on date,
        UNIQUE(user_id,item_key,language));
      CREATE TABLE public.friend_activity_events(
        user_id uuid REFERENCES auth.users(id), event_type text, payload jsonb);
    `);
    await db.exec(migration);
    await db.query("INSERT INTO auth.users(id) VALUES ($1)", [USER]);
  }, 120_000);
  afterEach(async () => {
    await db.close();
  });

  async function complete(
    expected = {},
    events = [{ event_type: "lesson_completed", payload: { lessonId: "u1l1" } }],
  ) {
    return db.query<{ result: { status: string } }>(call, [
      USER,
      JSON.stringify(expected),
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
      JSON.stringify(["q2"]),
      JSON.stringify(events),
    ]);
  }

  it("commits every core table together and rejects stale retries", async () => {
    expect((await complete()).rows[0]?.result.status).toBe("applied");
    for (const table of [
      "user_progress",
      "language_progress",
      "lesson_completions",
      "activity_days",
      "review_items",
      "friend_activity_events",
    ]) {
      expect((await db.query(`SELECT * FROM public.${table}`)).rows).toHaveLength(1);
    }
    expect((await complete()).rows[0]?.result.status).toBe("conflict");
    expect((await db.query("SELECT * FROM public.friend_activity_events")).rows).toHaveLength(1);
  });

  it("rolls back all six tables if the last event insert fails", async () => {
    await db.exec(`
      CREATE FUNCTION public.reject_event() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected event failure'; END; $$;
      CREATE TRIGGER reject_event BEFORE INSERT ON public.friend_activity_events
      FOR EACH ROW EXECUTE FUNCTION public.reject_event();
    `);
    await expect(complete()).rejects.toThrow(/injected event failure/);
    for (const table of [
      "user_progress",
      "language_progress",
      "lesson_completions",
      "activity_days",
      "review_items",
      "friend_activity_events",
    ]) {
      expect((await db.query(`SELECT * FROM public.${table}`)).rows).toHaveLength(0);
    }
  });
});
