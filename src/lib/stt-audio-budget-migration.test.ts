import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Daily voice time (20261105100900): seconds of transcribed audio per learner per UTC day, kept in ai_usage under
 * kind 'stt_seconds' next to the existing call counter. Only the server (service role) reads or adds to it.
 */
const FILE = "20261105100900_stt_audio_budget.sql";
const file = path.join(process.cwd(), "supabase/migrations", FILE);
const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";

let db: PGlite;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    INSERT INTO auth.users VALUES ('${U1}'), ('${U2}');
    CREATE TABLE public.ai_usage (
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, day date NOT NULL DEFAULT current_date,
      kind text NOT NULL, count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, day, kind));
    INSERT INTO public.ai_usage VALUES ('${U1}', current_date, 'stt', 7, now());
  `);
  expect(existsSync(file)).toBe(true);
  await db.exec(readFileSync(file, "utf8"));
});

const used = async (u: string) =>
  (await db.query<{ n: number }>("SELECT public.stt_audio_seconds_used($1) AS n", [u])).rows[0]!.n;
const add = async (u: string, s: number) =>
  (await db.query<{ n: number }>("SELECT public.add_stt_audio_seconds($1, $2) AS n", [u, s]))
    .rows[0]!.n;

describe("voice time budget functions (real Postgres)", () => {
  it("adds seconds per learner and per day, apart from the call counter", async () => {
    expect(await used(U1)).toBe(0);
    expect(await add(U1, 42)).toBe(42);
    expect(await add(U1, 90)).toBe(132);
    expect(await used(U1)).toBe(132);
    expect(await used(U2)).toBe(0);
    await db.exec(
      `INSERT INTO public.ai_usage VALUES ('${U2}', current_date - 1, 'stt_seconds', 5000, now())`,
    );
    expect(await used(U2)).toBe(0);
    const { rows } = await db.query<{ count: number }>(
      "SELECT count FROM public.ai_usage WHERE user_id = $1 AND kind = 'stt'",
      [U1],
    );
    expect(rows[0]!.count).toBe(7);
  });

  it("refuses a negative charge, which would hand time back", async () => {
    await add(U1, 100);
    await expect(add(U1, -100)).rejects.toThrow(/seconds/);
    expect(await used(U1)).toBe(100);
  });

  it("is callable by the server only", async () => {
    const { rows } = await db.query<Record<string, boolean>>(`
      SELECT has_function_privilege('authenticated', 'public.stt_audio_seconds_used(uuid)', 'EXECUTE') AS a,
             has_function_privilege('anon', 'public.stt_audio_seconds_used(uuid)', 'EXECUTE') AS b,
             has_function_privilege('authenticated', 'public.add_stt_audio_seconds(uuid, integer)', 'EXECUTE') AS c,
             has_function_privilege('anon', 'public.add_stt_audio_seconds(uuid, integer)', 'EXECUTE') AS d,
             has_function_privilege('service_role', 'public.add_stt_audio_seconds(uuid, integer)', 'EXECUTE') AS e,
             has_function_privilege('service_role', 'public.stt_audio_seconds_used(uuid)', 'EXECUTE') AS f`);
    expect(rows[0]).toEqual({ a: false, b: false, c: false, d: false, e: true, f: true });
  });
});
