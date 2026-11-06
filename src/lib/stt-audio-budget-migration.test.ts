import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Daily voice time (20261105100900): seconds of transcribed audio per learner per UTC day, kept in ai_usage under
 * kind 'stt_seconds' next to the existing call counter. Reserved before a provider call, settled after; only the
 * server (service role) can call either function.
 *
 * PGlite has one connection, so the calls below run one after another. Behaviour under real parallel transactions is
 * tested against the local Supabase stack in CI: stt-audio-budget-concurrency.test.ts.
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

const used = async (u: string, day = "current_date") =>
  (
    await db.query<{ n: number }>(
      `SELECT coalesce((SELECT count FROM public.ai_usage WHERE user_id = $1 AND day = ${day}
         AND kind = 'stt_seconds'), 0) AS n`,
      [u],
    )
  ).rows[0]!.n;
const reserve = async (u: string, s: number, budget = 1200) =>
  (
    await db.query<{ d: string | null }>(
      "SELECT public.reserve_stt_audio_seconds($1, $2, $3)::text AS d",
      [u, s, budget],
    )
  ).rows[0]!.d;
const settle = (u: string, day: string, reserved: number, actual: number) =>
  db.query("SELECT public.settle_stt_audio_seconds($1, $2::date, $3, $4)", [
    u,
    day,
    reserved,
    actual,
  ]);

describe("voice time reservations (real Postgres)", () => {
  it("books seconds while they fit in the budget, and returns the day they were booked on", async () => {
    const today = (await db.query<{ d: string }>("SELECT current_date::text AS d")).rows[0]!.d;
    expect(await reserve(U1, 1000)).toBe(today);
    expect(await reserve(U1, 120)).toBe(today); // 1120
    expect(await reserve(U1, 80)).toBe(today); // exactly 1200
    expect(await reserve(U1, 1)).toBeNull();
    expect(await used(U1)).toBe(1200);
    expect(await reserve(U2, 1201)).toBeNull();
    expect(await used(U2)).toBe(0);
  });

  it("near the limit, of many reservations only those that fit are booked", async () => {
    await reserve(U1, 600);
    const results = [];
    for (let i = 0; i < 20; i++) results.push(await reserve(U1, 120));
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(await used(U1)).toBe(1200);
  });

  it("settles to the actual length: a refund, a top-up for a long recording, never below zero", async () => {
    const day = (await reserve(U1, 120))!;
    await settle(U1, day, 120, 13);
    expect(await used(U1)).toBe(13);
    const day2 = (await reserve(U1, 120))!;
    await settle(U1, day2, 120, 1320);
    expect(await used(U1)).toBe(1333);
    await settle(U1, day2, 5000, 0);
    expect(await used(U1)).toBe(0);
  });

  it("settles on the day of the reservation, not on today", async () => {
    await db.exec(
      `INSERT INTO public.ai_usage VALUES ('${U1}', current_date - 1, 'stt_seconds', 120, now())`,
    );
    await reserve(U1, 120);
    const yesterday = (await db.query<{ d: string }>("SELECT (current_date - 1)::text AS d"))
      .rows[0]!.d;
    await settle(U1, yesterday, 120, 0);
    expect(await used(U1, "current_date - 1")).toBe(0);
    expect(await used(U1)).toBe(120);
  });

  it("keeps the call counter apart", async () => {
    await reserve(U1, 300);
    const { rows } = await db.query<{ count: number }>(
      "SELECT count FROM public.ai_usage WHERE user_id = $1 AND kind = 'stt'",
      [U1],
    );
    expect(rows[0]!.count).toBe(7);
  });

  it("refuses negative seconds, which would hand time back", async () => {
    await reserve(U1, 100);
    await expect(reserve(U1, -100)).rejects.toThrow(/zero or more/);
    const day = (await reserve(U1, 0))!;
    await expect(settle(U1, day, 0, -50)).rejects.toThrow(/zero or more/);
    expect(await used(U1)).toBe(100);
  });

  it("is callable by the server only", async () => {
    const { rows } = await db.query<Record<string, boolean>>(`
      SELECT has_function_privilege('authenticated', 'public.reserve_stt_audio_seconds(uuid, integer, integer)', 'EXECUTE') AS a,
             has_function_privilege('anon', 'public.reserve_stt_audio_seconds(uuid, integer, integer)', 'EXECUTE') AS b,
             has_function_privilege('authenticated', 'public.settle_stt_audio_seconds(uuid, date, integer, integer)', 'EXECUTE') AS c,
             has_function_privilege('anon', 'public.settle_stt_audio_seconds(uuid, date, integer, integer)', 'EXECUTE') AS d,
             has_function_privilege('service_role', 'public.reserve_stt_audio_seconds(uuid, integer, integer)', 'EXECUTE') AS e,
             has_function_privilege('service_role', 'public.settle_stt_audio_seconds(uuid, date, integer, integer)', 'EXECUTE') AS f`);
    expect(rows[0]).toEqual({ a: false, b: false, c: false, d: false, e: true, f: true });
  });
});
