import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkNewTableGrants } from "./migration-grants";

/**
 * Rehearsal run memory (20261129110000), EXECUTED in a real Postgres (PGlite): a finished rehearsal call writes its
 * run row in the same transaction as the recap finish, exactly once, and a call under the finish rule writes nothing.
 * The tables and functions it builds on are the real migrations, in the order production applies them.
 */
const read = (file: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", file), "utf8");
const MIGRATIONS = [
  "20261107032021_practice_stars.sql",
  "20261119100000_call_recap_memory.sql",
  "20261128170000_call_recap_retryable_claim.sql",
  "20261128210000_weakness_events_course.sql",
  "20261129100000_rehearsals.sql",
];
const NEW = read("20261129110000_rehearsal_run_memory.sql");

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000b2";
const R1 = "00000000-0000-4000-8000-0000000000d1";
const C_OK = "00000000-0000-4000-8000-0000000000c1";
const C_SHORT = "00000000-0000-4000-8000-0000000000c2";
const C_SCENARIO = "00000000-0000-4000-8000-0000000000c3";
const C_CAP = "00000000-0000-4000-8000-0000000000c4";

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
    INSERT INTO auth.users(id) VALUES ('${A}'), ('${B}');
    CREATE TABLE public.weakness_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
      category text NOT NULL, event_type text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.review_items (user_id uuid NOT NULL, item_key text NOT NULL, language text NOT NULL DEFAULT 'en',
      source text NOT NULL DEFAULT 'lesson', weakness_label text, PRIMARY KEY (user_id, item_key, language));
    CREATE TABLE public.ai_usage (user_id uuid NOT NULL, day date NOT NULL, kind text NOT NULL,
      count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, day, kind));
    CREATE TABLE public.ai_rate_limits (user_id uuid NOT NULL, kind text NOT NULL, minute_bucket timestamptz NOT NULL,
      count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, kind, minute_bucket));
  `);
  for (const m of MIGRATIONS) await db.exec(read(m));
  await db.exec(NEW);
  await db.exec(`
    INSERT INTO public.rehearsals (id, user_id, course, event_kind, counterpart, brief, free)
      VALUES ('${R1}', '${A}', 'en', 'interview', 'a hiring manager', '{}'::jsonb, true);
    INSERT INTO public.practice_calls (id, user_id, course, kind, item_key, replies, finished_at, stars) VALUES
      ('${C_OK}', '${A}', 'en', 'rehearsal', '${R1}:conversation', 5, now(), 2),
      ('${C_SHORT}', '${A}', 'en', 'rehearsal', '${R1}:warmup', 3, now(), 0),
      ('${C_CAP}', '${A}', 'en', 'rehearsal', '${R1}:hard_moments', 6, now(), 3),
      ('${C_SCENARIO}', '${A}', 'en', 'scenario', 'coffee', 5, now(), 2);
  `);
}, 120_000);
afterAll(async () => {
  await db.close();
});

const asRole = async <T>(role: string, fn: () => Promise<T>, uid = "") => {
  await db.exec(`SELECT set_config('app.uid', '${uid}', false); SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE; SELECT set_config('app.uid', '', false)");
  }
};
const server = <T>(fn: () => Promise<T>) => asRole("service_role", fn);
const n = async (sql: string) => Number((await db.query<{ n: string }>(sql)).rows[0]!.n);

const finish = (
  user: string,
  call: string,
  run: { moments?: string[]; wentWell?: string[]; corrections?: string[] } = {},
) =>
  server(
    async () =>
      (
        await db.query<{ r: number }>(
          `SELECT public.finish_rehearsal_recap($1, 'en', $2, ARRAY['articles']::text[],
             '[{"topic":"articles","text":"I agree with the plan"}]'::jsonb, true, $3::text[], $4::text[], $5::text[]) r`,
          [
            user,
            call,
            `{${(run.moments ?? []).map((s) => `"${s}"`).join(",")}}`,
            `{${(run.wentWell ?? []).map((s) => `"${s}"`).join(",")}}`,
            `{${(run.corrections ?? []).map((s) => `"${s}"`).join(",")}}`,
          ],
        )
      ).rows[0]!.r,
  );
const claim = (user: string, call: string) =>
  server(() => db.query(`SELECT public.claim_call_recap('${user}', '${call}')`));

describe("the migration follows the repo's rules", () => {
  it("states what clients may do for every new table (it adds none)", () => {
    expect(checkNewTableGrants(NEW)).toEqual([]);
  });
});

describe("finish_rehearsal_recap", () => {
  it("writes exactly one run row, the recap's memory and the completed marker together", async () => {
    await claim(A, C_OK);
    const saved = await finish(A, C_OK, {
      moments: ["The salary question"],
      wentWell: ["The salary question"],
      corrections: ["I agree with the plan"],
    });
    expect(saved).toBe(1);
    const run = (
      await db.query<{
        stage: string;
        moments_shown: string[];
        went_well: string[];
        corrections: string[];
        practice_call_id: string;
      }>(`SELECT * FROM public.rehearsal_runs WHERE rehearsal_id = '${R1}'`)
    ).rows;
    expect(run).toHaveLength(1);
    expect(run[0]).toMatchObject({
      stage: "conversation",
      moments_shown: ["The salary question"],
      went_well: ["The salary question"],
      corrections: ["I agree with the plan"],
      practice_call_id: C_OK,
    });
    expect(
      await n(
        `SELECT count(*)::text n FROM public.practice_calls WHERE id='${C_OK}' AND recap_at IS NOT NULL`,
      ),
    ).toBe(1);
    expect(
      await n(`SELECT count(*)::text n FROM public.tutor_memory WHERE call_id='${C_OK}'`),
    ).toBe(1);
  });

  it("a retry writes nothing twice", async () => {
    expect(await finish(A, C_OK, { moments: ["Another moment"] })).toBe(-1);
    expect(
      await n(`SELECT count(*)::text n FROM public.rehearsal_runs WHERE rehearsal_id='${R1}'`),
    ).toBe(1);
    expect(
      await n(`SELECT count(*)::text n FROM public.tutor_memory WHERE call_id='${C_OK}'`),
    ).toBe(1);
  });

  it("a run under the finish rule writes no run row, no memory and does not complete the call", async () => {
    expect(await finish(A, C_SHORT, { moments: ["The salary question"] })).toBe(-2);
    expect(
      await n(
        `SELECT count(*)::text n FROM public.rehearsal_runs WHERE practice_call_id='${C_SHORT}'`,
      ),
    ).toBe(0);
    expect(
      await n(`SELECT count(*)::text n FROM public.tutor_memory WHERE call_id='${C_SHORT}'`),
    ).toBe(0);
    expect(
      await n(
        `SELECT count(*)::text n FROM public.practice_calls WHERE id='${C_SHORT}' AND recap_at IS NULL`,
      ),
    ).toBe(1);
  });

  it("does nothing for a call that is not a rehearsal's, or not this learner's", async () => {
    expect(await finish(A, C_SCENARIO)).toBe(-1);
    expect(await finish(B, C_CAP)).toBe(-1);
    expect(await n(`SELECT count(*)::text n FROM public.rehearsal_runs`)).toBe(1);
  });

  it("keeps at most 5 items per array, whatever it is given", async () => {
    const seven = ["a", "b", "c", "d", "e", "f", "g"];
    await finish(A, C_CAP, { moments: seven, wentWell: seven, corrections: seven });
    const row = (
      await db.query<{ moments_shown: string[]; went_well: string[]; corrections: string[] }>(
        `SELECT moments_shown, went_well, corrections FROM public.rehearsal_runs WHERE practice_call_id='${C_CAP}'`,
      )
    ).rows[0]!;
    expect(row.moments_shown).toHaveLength(5);
    expect(row.went_well).toHaveLength(5);
    expect(row.corrections).toHaveLength(5);
  });

  it("is not callable by a signed-in learner", async () => {
    await expect(
      asRole(
        "authenticated",
        () =>
          db.query(
            `SELECT public.finish_rehearsal_recap('${A}','en','${C_OK}','{}'::text[],'[]'::jsonb,true,'{}'::text[],'{}'::text[],'{}'::text[])`,
          ),
        A,
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("closing a rehearsal (How did it go?)", () => {
  it("closes an active rehearsal once, with one fixed memory line, and refuses a second close", async () => {
    const close = () =>
      server(
        async () =>
          (
            await db.query<{ status: string }>(
              `SELECT * FROM public.close_rehearsal('${A}', '${R1}', '{"choice":"well"}'::jsonb, 'Job interview rehearsal: it went well')`,
            )
          ).rows[0]!,
      );
    const closed = await close();
    expect(closed.status).toBe("done");
    expect(
      await n(
        `SELECT count(*)::text n FROM public.rehearsals WHERE id='${R1}' AND closed_at IS NOT NULL`,
      ),
    ).toBe(1);
    expect(
      await n(
        `SELECT count(*)::text n FROM public.tutor_memory WHERE user_id='${A}' AND kind='phrase' AND memory_key='rehearsal:${R1}'`,
      ),
    ).toBe(1);
    await expect(close()).rejects.toThrow(/rehearsal_closed/);
    expect(
      await n(
        `SELECT count(*)::text n FROM public.tutor_memory WHERE memory_key='rehearsal:${R1}'`,
      ),
    ).toBe(1);
  });

  it("moves the date of an active rehearsal and keeps it active; a closed one is refused", async () => {
    const R2 = "00000000-0000-4000-8000-0000000000d2";
    await db.exec(
      `INSERT INTO public.rehearsals (id, user_id, course, event_kind, counterpart, brief, free)
       VALUES ('${R2}', '${B}', 'en', 'meeting', 'my team', '{}'::jsonb, false)`,
    );
    const moved = await server(
      async () =>
        (
          await db.query<{ status: string; event_date: string }>(
            `SELECT status, event_date::text FROM public.move_rehearsal('${B}', '${R2}', '2027-01-15')`,
          )
        ).rows[0]!,
    );
    expect(moved).toEqual({ status: "active", event_date: "2027-01-15" });
    await expect(
      server(() => db.query(`SELECT * FROM public.move_rehearsal('${A}', '${R1}', '2027-01-15')`)),
    ).rejects.toThrow(/rehearsal_not_found/);
  });

  it("a learner cannot move or close ANOTHER learner's active rehearsal", async () => {
    const R2 = "00000000-0000-4000-8000-0000000000d2"; // B's, still active from the test above
    await expect(
      server(() => db.query(`SELECT * FROM public.move_rehearsal('${A}', '${R2}', '2027-03-01')`)),
    ).rejects.toThrow(/rehearsal_not_found/);
    await expect(
      server(() =>
        db.query(
          `SELECT * FROM public.close_rehearsal('${A}', '${R2}', '{"choice":"well"}'::jsonb, 'Rehearsed a work meeting: it went well')`,
        ),
      ),
    ).rejects.toThrow(/rehearsal_not_found/);
    const row = (
      await db.query<{ status: string; event_date: string; closed_at: string | null }>(
        `SELECT status, event_date::text, closed_at::text FROM public.rehearsals WHERE id = '${R2}'`,
      )
    ).rows[0]!;
    expect(row).toEqual({ status: "active", event_date: "2027-01-15", closed_at: null });
    expect(
      await n(
        `SELECT count(*)::text n FROM public.tutor_memory WHERE memory_key = 'rehearsal:${R2}'`,
      ),
    ).toBe(0);
  });
});
