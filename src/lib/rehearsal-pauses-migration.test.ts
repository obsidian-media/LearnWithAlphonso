import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkNewTableGrants } from "./migration-grants";

/**
 * Rehearsals v2 slice B2 (20261203100000), EXECUTED in a real Postgres (PGlite): a finished run stores how many replies
 * were timed and how many were slow, as two numbers, and an old run (or a caller that sends no timings) keeps null. Built on the real migrations in production order.
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
  "20261201100000_rehearsal_speaking_signals.sql",
  "20261202100000_rehearsal_hector_hard_mode.sql",
];
const NEW_FILE = "20261203100000_rehearsal_reply_pauses.sql";
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

const call = (n: number, stage: string, replies: number) =>
  db.exec(`
    INSERT INTO public.practice_calls (id, user_id, course, kind, item_key, replies, short_replies, english_replies, finished_at, stars)
      VALUES ('${id(n)}', '${A}', 'fr', 'rehearsal', '${R1}:${stage}', ${replies}, 0, 0, now(), 1);
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
      `SELECT reply_latency_total, reply_latency_slow, key_phrases_used
         FROM public.rehearsal_runs WHERE practice_call_id = '${id(n)}'`,
    )
  ).rows[0];
const NONE = { reply_latency_total: null, reply_latency_slow: null };

describe("the migration follows the repo's rules", () => {
  it("adds no table that needs a grants statement", () => {
    expect(checkNewTableGrants(NEW)).toEqual([]);
  });
  it("is versioned after the migration it depends on", () => {
    expect(NEW_FILE > "20261202100000_rehearsal_hector_hard_mode.sql").toBe(true);
  });
  it("can be applied twice", async () => {
    await expect(db.exec(NEW)).resolves.not.toThrow();
  });
});

describe("the pause counts of a finished run", () => {
  it("are stored as two numbers, next to the B1 key-phrase pair", async () => {
    await call(1, "conversation", 6);
    await finish(1, ", 4, 3, 8, 6, 4");
    expect(await runOf(1)).toEqual({
      reply_latency_total: 6,
      reply_latency_slow: 4,
      key_phrases_used: 3,
    });
  });

  it("a caller that sends no timings writes no pause signal (and keeps the rest)", async () => {
    await call(2, "conversation", 5);
    await finish(2, ", 4, 3, 8");
    expect(await runOf(2)).toEqual({ ...NONE, key_phrases_used: 3 });
  });

  it("the twelve-argument call of the previous slice still works", async () => {
    await call(3, "conversation", 5);
    expect(await finish(3, ", 4, 2, 5")).toBeGreaterThanOrEqual(0);
    expect(await runOf(3)).toEqual({ ...NONE, key_phrases_used: 2 });
  });

  it("a bad pair is stored as no signal, never as a wrong one", async () => {
    const bad: [string, string][] = [
      ["one missing", ", 4, NULL, NULL, 5, NULL"],
      ["slow above total", ", 4, NULL, NULL, 5, 6"],
      ["total above 60", ", 4, NULL, NULL, 61, 3"],
      ["total above the replies", ", 4, NULL, NULL, 9, 3"],
      ["negative slow", ", 4, NULL, NULL, 5, -1"],
      ["total of 0", ", 4, NULL, NULL, 0, 0"],
    ];
    let n = 10;
    for (const [, extra] of bad) {
      await call(n, "conversation", 5);
      await finish(n, extra);
      expect(await runOf(n)).toMatchObject(NONE);
      n += 1;
    }
  });

  it("the edges are accepted: all slow, none slow, as many timed as replies", async () => {
    await call(30, "conversation", 5);
    await finish(30, ", 4, NULL, NULL, 5, 5");
    expect(await runOf(30)).toMatchObject({ reply_latency_total: 5, reply_latency_slow: 5 });
    await call(31, "conversation", 5);
    await finish(31, ", 4, NULL, NULL, 1, 0");
    expect(await runOf(31)).toMatchObject({ reply_latency_total: 1, reply_latency_slow: 0 });
  });

  it("a run under the finish floor still writes nothing", async () => {
    await call(40, "warmup", 3);
    expect(await finish(40, ", 4, NULL, NULL, 3, 2")).toBe(-2);
    expect(await runOf(40)).toBeUndefined();
  });

  it("an old run keeps null in both new columns", async () => {
    const old = (
      await db.query<Record<string, number | null>>(
        `SELECT reply_latency_total, reply_latency_slow FROM public.rehearsal_runs WHERE practice_call_id IS NULL`,
      )
    ).rows[0];
    expect(old).toEqual(NONE);
  });
});

describe("the columns hold numbers and nothing else", () => {
  it("both new columns are integers", async () => {
    const cols = await db.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_name = 'rehearsal_runs' AND column_name LIKE 'reply_latency_%' ORDER BY column_name`,
    );
    expect(cols.rows.map((c) => c.column_name)).toEqual([
      "reply_latency_slow",
      "reply_latency_total",
    ]);
    expect(new Set(cols.rows.map((c) => c.data_type))).toEqual(new Set(["integer"]));
  });

  it("the table refuses a slow count above its total, and one half of the pair", async () => {
    await expect(
      db.exec(`INSERT INTO public.rehearsal_runs (rehearsal_id, user_id, stage, reply_latency_total, reply_latency_slow)
                 VALUES ('${R1}', '${A}', 'warmup', 3, 4)`),
    ).rejects.toThrow();
    await expect(
      db.exec(`INSERT INTO public.rehearsal_runs (rehearsal_id, user_id, stage, reply_latency_total)
                 VALUES ('${R1}', '${A}', 'warmup', 3)`),
    ).rejects.toThrow();
    await expect(
      db.exec(`INSERT INTO public.rehearsal_runs (rehearsal_id, user_id, stage, reply_latency_total, reply_latency_slow)
                 VALUES ('${R1}', '${A}', 'warmup', 61, 1)`),
    ).rejects.toThrow();
  });
});

describe("the function", () => {
  it("is the only finish_rehearsal_recap, and only the server may run it", async () => {
    const r = await db.query<{ n: string }>(
      `SELECT count(*) n FROM pg_proc WHERE proname = 'finish_rehearsal_recap'`,
    );
    expect(Number(r.rows[0]!.n)).toBe(1);
    for (const role of ["authenticated", "anon"])
      await expect(
        asRole(role, () =>
          db.query(
            `SELECT public.finish_rehearsal_recap('${A}', 'fr', '${id(99)}', ARRAY[]::text[], '[]'::jsonb, true,
               ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[])`,
          ),
        ),
      ).rejects.toThrow(/permission denied/i);
  });
});
