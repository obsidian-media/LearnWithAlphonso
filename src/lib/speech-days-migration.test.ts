import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Minutes spoken (20261106100000): seconds of transcribed learner speech per learner per UTC day, added by the server
 * only, read by the learner (own rows only), gone with the account.
 *
 * Every date below comes from the database's own clock, never a fixed calendar date. PGlite has one connection, so
 * parallel additions are tested against the local Supabase stack in CI: speech-days-concurrency.test.ts.
 */
const FILE = "20261106100000_speech_days.sql";
const file = path.join(process.cwd(), "supabase/migrations", FILE);
const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";

let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    -- service_role bypasses row-level security, as on Supabase.
    CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticated; CREATE ROLE anon;
    -- Supabase's own defaults hand clients everything on new objects; the migration must take that back itself.
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
    INSERT INTO auth.users VALUES ('${U1}'), ('${U2}');
  `);
  expect(existsSync(file)).toBe(true);
  await db.exec(readFileSync(file, "utf8"));
});

/** Today's UTC date, from the database clock's epoch (not from the expression under test). */
const utcToday = async () => {
  const { rows } = await db.query<{ e: number }>("SELECT extract(epoch FROM now())::float8 AS e");
  return new Date(rows[0]!.e * 1000).toISOString().slice(0, 10);
};
const add = async (u: string, s: number | null) =>
  (
    await db.query<{ d: string | null }>("SELECT public.add_speech_seconds($1, $2)::text AS d", [
      u,
      s,
    ])
  ).rows[0]!.d;
const total = async (u: string, day: string) =>
  (
    await db.query<{ n: number }>(
      `SELECT coalesce((SELECT speech_seconds FROM public.speech_days WHERE user_id = $1 AND day = $2::date), 0) AS n`,
      [u, day],
    )
  ).rows[0]!.n;

describe("speech_days (real Postgres)", () => {
  it("adds each transcription to the learner's own UTC day and returns that day", async () => {
    const today = await utcToday();
    expect(await add(U1, 13)).toBe(today);
    expect(await add(U1, 7)).toBe(today);
    expect(await add(U2, 4)).toBe(today);
    expect(await total(U1, today)).toBe(20);
    expect(await total(U2, today)).toBe(4);
  });

  it("uses the UTC date whatever the session time zone is", async () => {
    // At any instant at least one of these zones is on a different calendar date than UTC (+14 from 10:00 UTC,
    // -11 before 11:00 UTC), so a function that used the session's local date would book the wrong day in one.
    const today = await utcToday();
    for (const zone of ["Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
      await db.exec(`SET TIME ZONE '${zone}'`);
      expect(await add(U1, 1), zone).toBe(today);
    }
    await db.exec("RESET TIME ZONE");
    expect(await total(U1, today)).toBe(2);
  });

  it("leaves earlier days as they were", async () => {
    await db.exec(`
      INSERT INTO public.speech_days (user_id, day, speech_seconds)
      VALUES ('${U1}', (now() AT TIME ZONE 'UTC')::date - 1, 50)`);
    const today = await utcToday();
    await add(U1, 10);
    const yesterday = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
    expect(await total(U1, yesterday)).toBe(50);
    expect(await total(U1, today)).toBe(10);
  });

  it("refuses negative or missing seconds, which would take time away", async () => {
    await add(U1, 30);
    await expect(add(U1, -30)).rejects.toThrow(/from 0 to 3600/);
    await expect(add(U1, null)).rejects.toThrow(/from 0 to 3600/);
    expect(await total(U1, await utcToday())).toBe(30);
  });

  it("refuses more than an hour in one call, so a bad caller cannot inflate the day", async () => {
    expect(await add(U1, 3600)).toBe(await utcToday());
    await expect(add(U1, 3601)).rejects.toThrow(/from 0 to 3600/);
    await expect(add(U1, 2_000_000_000)).rejects.toThrow(/from 0 to 3600/);
    expect(await total(U1, await utcToday())).toBe(3600);
  });

  it("the server can add, inside a transaction that is then rolled back", async () => {
    await db.exec(`BEGIN; SET LOCAL ROLE service_role;`);
    expect(await add(U1, 9)).toBe(await utcToday());
    expect(await total(U1, await utcToday())).toBe(9);
    await db.exec("ROLLBACK");
    expect(await total(U1, await utcToday())).toBe(0);
  });

  it("a signed-in learner cannot add, write or delete, as the learner, in a rolled-back transaction", async () => {
    await add(U1, 40);
    const today = await utcToday();
    const asLearner = async (sql: string) => {
      await db.exec(
        `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('app.uid', '${U1}', true);`,
      );
      try {
        await db.exec(sql);
        return "allowed";
      } catch (e) {
        return (e as Error).message;
      } finally {
        await db.exec("ROLLBACK");
      }
    };
    expect(await asLearner(`SELECT public.add_speech_seconds('${U1}', 600)`)).toMatch(
      /permission denied/,
    );
    expect(
      await asLearner(
        `INSERT INTO public.speech_days (user_id, day, speech_seconds) VALUES ('${U1}', current_date + 1, 600)`,
      ),
    ).toMatch(/permission denied/);
    expect(await asLearner(`UPDATE public.speech_days SET speech_seconds = 9999`)).toMatch(
      /permission denied/,
    );
    expect(await asLearner(`DELETE FROM public.speech_days`)).toMatch(/permission denied/);
    expect(await total(U1, today)).toBe(40);
  });

  it("a signed-in learner reads only their own days; signed out reads nothing", async () => {
    await add(U1, 12);
    await add(U2, 34);
    await db.exec(
      `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('app.uid', '${U1}', true);`,
    );
    const mine = await db.query<{ user_id: string; speech_seconds: number }>(
      "SELECT user_id, speech_seconds FROM public.speech_days",
    );
    await db.exec("ROLLBACK");
    expect(mine.rows).toEqual([{ user_id: U1, speech_seconds: 12 }]);

    await db.exec("BEGIN; SET LOCAL ROLE anon;");
    const anon = await db.query("SELECT 1 FROM public.speech_days").catch((e: Error) => e.message);
    await db.exec("ROLLBACK");
    expect(anon).toMatch(/permission denied/);
  });

  it("grants: the learner SELECT only, the function to the server only", async () => {
    const { rows } = await db.query<Record<string, boolean>>(`
      SELECT has_table_privilege('authenticated', 'public.speech_days', 'SELECT') AS auth_select,
             has_table_privilege('authenticated', 'public.speech_days', 'INSERT,UPDATE,DELETE,TRUNCATE') AS auth_write,
             has_table_privilege('anon', 'public.speech_days', 'SELECT,INSERT,UPDATE,DELETE') AS anon_any,
             has_function_privilege('authenticated', 'public.add_speech_seconds(uuid, integer)', 'EXECUTE') AS auth_fn,
             has_function_privilege('anon', 'public.add_speech_seconds(uuid, integer)', 'EXECUTE') AS anon_fn,
             has_function_privilege('service_role', 'public.add_speech_seconds(uuid, integer)', 'EXECUTE') AS server_fn`);
    expect(rows[0]).toEqual({
      auth_select: true,
      auth_write: false,
      anon_any: false,
      auth_fn: false,
      anon_fn: false,
      server_fn: true,
    });
  });

  it("goes with the account", async () => {
    await add(U1, 5);
    await add(U2, 6);
    await db.exec(`DELETE FROM auth.users WHERE id = '${U1}'`);
    const { rows } = await db.query<{ user_id: string }>("SELECT user_id FROM public.speech_days");
    expect(rows).toEqual([{ user_id: U2 }]);
  });
});
