import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkNewTableGrants } from "./migration-grants";

/**
 * Rehearsals v2 slice B1 (20261201100000), EXECUTED in a real Postgres (PGlite): a finished run stores its speaking
 * signals as numbers, read from the call's own row, and an old run (or a caller that sends no key-phrase pair) keeps
 * null. Built on the real migrations in production order.
 */
const read = (file: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", file), "utf8");
const MIGRATIONS = [
  "20261107032021_practice_stars.sql",
  "20261113100000_staff_console.sql",
  "20261119100000_call_recap_memory.sql",
  "20261128170000_call_recap_retryable_claim.sql",
  "20261128210000_weakness_events_course.sql",
  "20261129100000_rehearsals.sql",
  "20261129110000_rehearsal_run_memory.sql",
  "20261130100000_rehearsals_switch_and_auto_close.sql",
];
const NEW_FILE = "20261201100000_rehearsal_speaking_signals.sql";
const NEW = read(NEW_FILE);

const A = "00000000-0000-4000-8000-0000000000a1";
const R1 = "00000000-0000-4000-8000-0000000000d1";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticated; CREATE ROLE anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
    INSERT INTO auth.users(id) VALUES ('${A}');
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
  for (const m of MIGRATIONS) await db.exec(read(m));
  // An OLD run, written before the new columns exist.
  await db.exec(`
    INSERT INTO public.rehearsals (id, user_id, course, event_kind, counterpart, brief, free)
      VALUES ('${R1}', '${A}', 'en', 'interview', 'a hiring manager', '{}'::jsonb, true);
    INSERT INTO public.rehearsal_runs (rehearsal_id, user_id, stage) VALUES ('${R1}', '${A}', 'warmup');
  `);
  await db.exec(NEW);
}, 120_000);
afterAll(async () => {
  await db.close();
});

const asRole = async <T>(role: string, fn: () => Promise<T>) => {
  await db.exec(`SELECT set_config('app.uid', '${A}', false); SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE; SELECT set_config('app.uid', '', false)");
  }
};
const server = <T>(fn: () => Promise<T>) => asRole("service_role", fn);

const call = (n: number, stage: string, replies: number, short: number, english: number) =>
  db.exec(`
    INSERT INTO public.practice_calls (id, user_id, course, kind, item_key, replies, short_replies, english_replies, finished_at, stars)
      VALUES ('${id(n)}', '${A}', 'fr', 'rehearsal', '${R1}:${stage}', ${replies}, ${short}, ${english}, now(), 1);
    SELECT public.claim_call_recap('${A}', '${id(n)}');`);
const finish = (n: number, extra = "") =>
  server(
    async () =>
      (
        await db.query<{ r: number }>(
          `SELECT public.finish_rehearsal_recap('${A}', 'fr', '${id(n)}', ARRAY[]::text[], '[]'::jsonb, true,
             ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[]${extra}) r`,
        )
      ).rows[0]!.r,
  );
const runOf = async (n: number) =>
  (
    await db.query<Record<string, number | null>>(
      `SELECT speaking_replies, speaking_full, speaking_english, key_phrases_used, key_phrases_total
         FROM public.rehearsal_runs WHERE practice_call_id = '${id(n)}'`,
    )
  ).rows[0];

describe("the migration follows the repo's rules", () => {
  it("adds no table that needs a grants statement", () => {
    expect(checkNewTableGrants(NEW)).toEqual([]);
  });
  it("is versioned after the migration it depends on", () => {
    expect(NEW_FILE > "20261130100000_rehearsals_switch_and_auto_close.sql").toBe(true);
  });
});

describe("the signals of a finished run", () => {
  it("are read from the call's own counts, with the key-phrase pair from the server", async () => {
    await call(1, "conversation", 6, 2, 1);
    await finish(1, ", 4, 3, 8");
    expect(await runOf(1)).toEqual({
      speaking_replies: 6,
      speaking_full: 4,
      speaking_english: 1,
      key_phrases_used: 3,
      key_phrases_total: 8,
    });
  });

  it("a caller that sends no key-phrase pair writes the reply counts and no key-phrase signal", async () => {
    await call(2, "conversation", 5, 0, 0);
    await finish(2);
    expect(await runOf(2)).toEqual({
      speaking_replies: 5,
      speaking_full: 5,
      speaking_english: 0,
      key_phrases_used: null,
      key_phrases_total: null,
    });
  });

  it("a bad key-phrase pair is stored as no signal, never as a wrong one", async () => {
    await call(3, "conversation", 5, 1, 0);
    await finish(3, ", 4, 9, 3");
    expect(await runOf(3)).toMatchObject({ key_phrases_used: null, key_phrases_total: null });
    await call(4, "conversation", 5, 1, 0);
    await finish(4, ", 4, -1, 3");
    expect(await runOf(4)).toMatchObject({ key_phrases_used: null, key_phrases_total: null });
    await call(5, "conversation", 5, 1, 0);
    await finish(5, ", 4, 2, 99");
    expect(await runOf(5)).toMatchObject({ key_phrases_used: null, key_phrases_total: null });
  });

  it("a run under the finish floor still writes nothing", async () => {
    await call(6, "warmup", 3, 0, 0);
    expect(await finish(6, ", 4, 1, 2")).toBe(-2);
    expect(await runOf(6)).toBeUndefined();
  });

  it("an old run keeps null in every new column", async () => {
    const old = (
      await db.query<Record<string, number | null>>(
        `SELECT speaking_replies, speaking_full, speaking_english, key_phrases_used, key_phrases_total
           FROM public.rehearsal_runs WHERE practice_call_id IS NULL`,
      )
    ).rows[0];
    expect(Object.values(old!)).toEqual([null, null, null, null, null]);
  });
});

describe("the columns hold numbers and nothing else", () => {
  it("every new column is an integer", async () => {
    const cols = await db.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_name = 'rehearsal_runs' AND (column_name LIKE 'speaking_%' OR column_name LIKE 'key_phrases_%')
         ORDER BY column_name`,
    );
    expect(cols.rows.map((c) => c.column_name)).toEqual([
      "key_phrases_total",
      "key_phrases_used",
      "speaking_english",
      "speaking_full",
      "speaking_replies",
    ]);
    expect(new Set(cols.rows.map((c) => c.data_type))).toEqual(new Set(["integer"]));
  });

  it("the table refuses a count above its total", async () => {
    await expect(
      db.exec(`INSERT INTO public.rehearsal_runs (rehearsal_id, user_id, stage, speaking_replies, speaking_full)
                 VALUES ('${R1}', '${A}', 'warmup', 3, 4)`),
    ).rejects.toThrow();
    await expect(
      db.exec(`INSERT INTO public.rehearsal_runs (rehearsal_id, user_id, stage, key_phrases_used, key_phrases_total)
                 VALUES ('${R1}', '${A}', 'warmup', 5, 4)`),
    ).rejects.toThrow();
  });
});

describe("the function", () => {
  it("is the only finish_rehearsal_recap, and only the server may run it", async () => {
    const r = await db.query<{ n: string }>(
      `SELECT count(*) n FROM pg_proc WHERE proname = 'finish_rehearsal_recap'`,
    );
    expect(Number(r.rows[0]!.n)).toBe(1);
    await expect(
      asRole("authenticated", () =>
        db.query(
          `SELECT public.finish_rehearsal_recap('${A}', 'fr', '${id(99)}', ARRAY[]::text[], '[]'::jsonb, true,
             ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[])`,
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asRole("anon", () =>
        db.query(
          `SELECT public.finish_rehearsal_recap('${A}', 'fr', '${id(99)}', ARRAY[]::text[], '[]'::jsonb, true,
             ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[])`,
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
