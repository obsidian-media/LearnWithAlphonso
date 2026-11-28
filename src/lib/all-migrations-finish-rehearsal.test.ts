import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Applies EVERY migration, in filename order, to a real Postgres (PGlite) and checks that the FINAL
 * finish_rehearsal_recap still writes everything earlier slices added to a run: the call's persona and hard_mode
 * (slice F) AND the pause counts (slice B2). A later CREATE OR REPLACE / DROP+CREATE of the function that forgets one
 * of them passes every per-migration test and silently loses data; this is the guard for that.
 */
const DIR = path.join(process.cwd(), "supabase/migrations");
const FILES = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const A = "00000000-0000-4000-8000-0000000000a1";
const R1 = "00000000-0000-4000-8000-0000000000d1";
const CALL = "00000000-0000-4000-8000-0000000000c1";

let db: PGlite;
const failed: string[] = [];
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO authenticated, anon, service_role;
    INSERT INTO auth.users(id) VALUES ('${A}');
    -- Platform tables the early (pre-baseline) history assumes; the same stand-ins as the per-slice tests.
    CREATE TABLE public.weakness_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
      category text NOT NULL, event_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.review_items (user_id uuid NOT NULL, item_key text NOT NULL, language text NOT NULL DEFAULT 'en',
      source text NOT NULL DEFAULT 'lesson', weakness_label text, PRIMARY KEY (user_id, item_key, language));
    CREATE TABLE public.ai_usage (user_id uuid NOT NULL, day date NOT NULL, kind text NOT NULL,
      count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, day, kind));
    CREATE TABLE public.ai_rate_limits (user_id uuid NOT NULL, kind text NOT NULL, minute_bucket timestamptz NOT NULL,
      count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, kind, minute_bucket));
    CREATE TABLE public.admin_users (user_id uuid PRIMARY KEY);
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, display_name text);
  `);
  for (const f of FILES) {
    const sql = readFileSync(path.join(DIR, f), "utf8");
    try {
      await db.exec(sql);
    } catch (e) {
      // The early history assumes a hosted baseline and some files need pg_cron or storage buckets, which PGlite cannot
      // stand up; those fail here and are not the point. Only a failure in a file that touches rehearsals or calls counts.
      if (/rehearsal|practice_calls|call_recap/.test(sql))
        failed.push(`${f}: ${(e as Error).message.split("\n")[0]}`);
    }
  }
}, 300_000);
afterAll(async () => {
  await db.close();
});

const call = (stage: string, extra: string) =>
  db.exec(`
    INSERT INTO public.rehearsals (id, user_id, course, event_kind, counterpart, brief, free)
      VALUES ('${R1}', '${A}', 'en', 'interview', 'a hiring manager', '{}'::jsonb, true) ON CONFLICT DO NOTHING;
    INSERT INTO public.practice_calls (id, user_id, course, kind, item_key, replies, short_replies, english_replies,
        finished_at, stars${extra ? ", persona, hard_mode" : ""})
      VALUES ('${CALL}', '${A}', 'fr', 'rehearsal', '${R1}:${stage}', 6, 0, 0, now(), 1${extra});
    SELECT public.claim_call_recap('${A}', '${CALL}');`);

describe("the whole migration history", () => {
  it("applies every migration that touches rehearsals or calls, in order", () => {
    expect(failed).toEqual([]);
  });

  it("the FINAL finish_rehearsal_recap copies persona, hard_mode AND the pause counts into the run", async () => {
    await call("hard_moments", ", 'hector', true");
    await db.exec("SET ROLE service_role");
    try {
      await db.query(
        `SELECT public.finish_rehearsal_recap('${A}', 'fr', '${CALL}', ARRAY[]::text[], '[]'::jsonb, true,
           ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[], 4, 3, 8, 6, 4)`,
      );
    } finally {
      await db.exec("RESET ROLE");
    }
    const run = (
      await db.query<Record<string, unknown>>(
        `SELECT persona, hard_mode, reply_latency_total, reply_latency_slow, key_phrases_used
           FROM public.rehearsal_runs WHERE practice_call_id = '${CALL}'`,
      )
    ).rows[0];
    expect(run).toEqual({
      persona: "hector",
      hard_mode: true,
      reply_latency_total: 6,
      reply_latency_slow: 4,
      key_phrases_used: 3,
    });
  });

  it("there is exactly one finish_rehearsal_recap (no stale overload for a caller to hit)", async () => {
    const r = await db.query<{ n: string }>(
      `SELECT count(*) n FROM pg_proc WHERE proname = 'finish_rehearsal_recap'`,
    );
    expect(Number(r.rows[0]!.n)).toBe(1);
  });
});
