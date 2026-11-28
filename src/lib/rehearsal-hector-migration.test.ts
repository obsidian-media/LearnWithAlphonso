import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkNewTableGrants } from "./migration-grants";

/**
 * Rehearsals v2 slice F (20261202100000), EXECUTED in a real Postgres (PGlite): a call carries its persona and hard mode,
 * the finished run copies them, hard mode is Hector on the last stage only (in the database too), and the function keeps
 * its exact signature and grants so the previous deploy's code still works. Built on the real migrations in order.
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
];
const NEW_FILE = "20261202100000_rehearsal_hector_hard_mode.sql";
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
  await db.exec(`
    INSERT INTO public.rehearsals (id, user_id, course, event_kind, counterpart, brief, free)
      VALUES ('${R1}', '${A}', 'en', 'interview', 'a hiring manager', '{}'::jsonb, true);
    INSERT INTO public.rehearsal_runs (rehearsal_id, user_id, stage) VALUES ('${R1}', '${A}', 'warmup');
    INSERT INTO public.practice_calls (id, user_id, course, kind, item_key, replies, finished_at, stars)
      VALUES ('${id(90)}', '${A}', 'en', 'rehearsal', '${R1}:conversation', 5, now(), 1);
  `);
  await db.exec(NEW);
}, 120_000);
afterAll(async () => {
  await db.close();
});

const asServer = async <T>(fn: () => Promise<T>) => {
  await db.exec(`SET ROLE service_role`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE");
  }
};

const call = (n: number, stage: string, persona?: string, hard?: boolean) =>
  db.exec(`
    INSERT INTO public.practice_calls (id, user_id, course, kind, item_key, replies, finished_at, stars${persona ? ", persona, hard_mode" : ""})
      VALUES ('${id(n)}', '${A}', 'en', 'rehearsal', '${R1}:${stage}', 6, now(), 1${persona ? `, '${persona}', ${hard ? "true" : "false"}` : ""});
    SELECT public.claim_call_recap('${A}', '${id(n)}');`);
const finish = (n: number) =>
  asServer(
    async () =>
      (
        await db.query<{ r: number }>(
          `SELECT public.finish_rehearsal_recap('${A}', 'en', '${id(n)}', ARRAY[]::text[], '[]'::jsonb, true,
             ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[]) r`,
        )
      ).rows[0]!.r,
  );
const runOf = async (n: number) =>
  (
    await db.query<{ persona: string; hard_mode: boolean }>(
      `SELECT persona, hard_mode FROM public.rehearsal_runs WHERE practice_call_id = '${id(n)}'`,
    )
  ).rows[0];

describe("the migration follows the repo's rules", () => {
  it("adds no table that needs a grants statement", () => {
    expect(checkNewTableGrants(NEW)).toEqual([]);
  });
  it("is versioned after the migration it depends on", () => {
    expect(NEW_FILE > "20261201100000_rehearsal_speaking_signals.sql").toBe(true);
  });
});

describe("a finished run copies its call's mode", () => {
  it("a call written before this migration, or by the old code, is Alphonso and not hard", async () => {
    const old = await db.query<{ persona: string; hard_mode: boolean }>(
      `SELECT persona, hard_mode FROM public.practice_calls WHERE id = '${id(90)}'`,
    );
    expect(old.rows[0]).toEqual({ persona: "alphonso", hard_mode: false });
    const oldRun = await db.query<{ persona: string; hard_mode: boolean }>(
      `SELECT persona, hard_mode FROM public.rehearsal_runs WHERE practice_call_id IS NULL`,
    );
    expect(oldRun.rows[0]).toEqual({ persona: "alphonso", hard_mode: false });
  });

  it("an Alphonso call (no mode written) becomes an Alphonso run", async () => {
    await call(1, "conversation");
    await finish(1);
    expect(await runOf(1)).toEqual({ persona: "alphonso", hard_mode: false });
  });

  it("a Hector call becomes a Hector run, and a hard-mode call a hard-mode run", async () => {
    await call(2, "conversation", "hector", false);
    await finish(2);
    expect(await runOf(2)).toEqual({ persona: "hector", hard_mode: false });
    await call(3, "hard_moments", "hector", true);
    await finish(3);
    expect(await runOf(3)).toEqual({ persona: "hector", hard_mode: true });
  });

  it("a hard-mode run and the stage's own run are two rows: it does not replace it", async () => {
    await call(4, "hard_moments", "hector", false);
    await finish(4);
    const rows = await db.query<{ n: string }>(
      `SELECT count(*) n FROM public.rehearsal_runs WHERE stage = 'hard_moments'`,
    );
    expect(Number(rows.rows[0]!.n)).toBe(2);
    expect(await runOf(4)).toEqual({ persona: "hector", hard_mode: false });
  });
});

describe("hard mode is Hector on the last stage, in the database too", () => {
  it.each([
    ["alphonso", "hard_moments"],
    ["hector", "conversation"],
    ["hector", "warmup"],
  ])("a %s call on %s cannot be hard mode", async (persona, stage) => {
    await expect(
      db.exec(`INSERT INTO public.practice_calls (id, user_id, course, kind, item_key, replies, persona, hard_mode)
                 VALUES ('${id(50)}', '${A}', 'en', 'rehearsal', '${R1}:${stage}', 0, '${persona}', true)`),
    ).rejects.toThrow();
    await expect(
      db.exec(`INSERT INTO public.rehearsal_runs (rehearsal_id, user_id, stage, persona, hard_mode)
                 VALUES ('${R1}', '${A}', '${stage}', '${persona}', true)`),
    ).rejects.toThrow();
  });

  it("only the two known personas are allowed", async () => {
    await expect(
      db.exec(`UPDATE public.practice_calls SET persona = 'zed' WHERE id = '${id(90)}'`),
    ).rejects.toThrow();
  });
});

describe("the function", () => {
  it("is still the only finish_rehearsal_recap, with the same grants: only the server may run it", async () => {
    const r = await db.query<{ n: string }>(
      `SELECT count(*) n FROM pg_proc WHERE proname = 'finish_rehearsal_recap'`,
    );
    expect(Number(r.rows[0]!.n)).toBe(1);
    await db.exec(`SELECT set_config('app.uid', '${A}', false); SET ROLE authenticated`);
    try {
      await expect(
        db.query(
          `SELECT public.finish_rehearsal_recap('${A}', 'en', '${id(1)}', ARRAY[]::text[], '[]'::jsonb, true, ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[])`,
        ),
      ).rejects.toThrow();
    } finally {
      await db.exec("RESET ROLE");
    }
  });
});
