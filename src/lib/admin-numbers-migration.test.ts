import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** admin_numbers_own (20261118100000), EXECUTED in a real Postgres (PGlite) over seeded rows. */
const FILE = "20261118100000_admin_numbers_own.sql";
const sqlText = readFileSync(path.join(process.cwd(), "supabase/migrations", FILE), "utf8");

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    CREATE TABLE public.profiles (id uuid PRIMARY KEY, created_at timestamptz NOT NULL, display_name text);
    CREATE TABLE public.learning_days (user_id uuid, day date);
    CREATE TABLE public.lesson_completions (user_id uuid, completed_at timestamptz);
    CREATE TABLE public.practice_calls (user_id uuid, started_at timestamptz);
    CREATE TABLE public.podcast_playback (user_id uuid, completed_at timestamptz);
    CREATE TABLE public.user_progress (user_id uuid, streak int, last_active_date date);
    CREATE TABLE public.content_reports (id serial);
    CREATE TABLE public.support_conversations (id serial, status text);
    CREATE TABLE public.ai_usage (user_id uuid, day date, kind text, count int);
  `);
  const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  // Cohort of 4 who joined 2 days ago (d1 cohort): 3 were active yesterday. Cohort joined 8 days ago: 0 of 1.
  await db.exec(`
    INSERT INTO public.profiles (id, created_at) VALUES
      ('${u(1)}', (now() AT TIME ZONE 'UTC')::date - 2 + time '10:00'),
      ('${u(2)}', (now() AT TIME ZONE 'UTC')::date - 2 + time '11:00'),
      ('${u(3)}', (now() AT TIME ZONE 'UTC')::date - 2 + time '12:00'),
      ('${u(4)}', (now() AT TIME ZONE 'UTC')::date - 2 + time '13:00'),
      ('${u(5)}', (now() AT TIME ZONE 'UTC')::date - 8 + time '10:00'),
      ('${u(6)}', now() - interval '60 days');
    INSERT INTO public.learning_days VALUES
      ('${u(1)}', (now() AT TIME ZONE 'UTC')::date - 1), ('${u(2)}', (now() AT TIME ZONE 'UTC')::date - 1),
      ('${u(3)}', (now() AT TIME ZONE 'UTC')::date - 1), ('${u(3)}', (now() AT TIME ZONE 'UTC')::date),
      ('${u(6)}', (now() AT TIME ZONE 'UTC')::date - 20);
    INSERT INTO public.lesson_completions VALUES ('${u(1)}', now()), ('${u(1)}', now() - interval '10 days');
    INSERT INTO public.practice_calls VALUES ('${u(1)}', now() - interval '1 day');
    INSERT INTO public.podcast_playback VALUES ('${u(1)}', now()), ('${u(2)}', NULL);
    INSERT INTO public.user_progress VALUES ('${u(1)}', 4, (now() AT TIME ZONE 'UTC')::date),
      ('${u(2)}', 6, (now() AT TIME ZONE 'UTC')::date - 1), ('${u(3)}', 0, (now() AT TIME ZONE 'UTC')::date),
      ('${u(6)}', 50, (now() AT TIME ZONE 'UTC')::date - 30);
    INSERT INTO public.content_reports DEFAULT VALUES;
    INSERT INTO public.support_conversations (status) VALUES ('new'), ('solved'), ('open');
    INSERT INTO public.ai_usage VALUES ('${u(1)}', (now() AT TIME ZONE 'UTC')::date, 'chat', 5),
      ('${u(2)}', (now() AT TIME ZONE 'UTC')::date, 'chat', 3), ('${u(1)}', (now() AT TIME ZONE 'UTC')::date - 20, 'chat', 100);
  `);
  await db.exec(sqlText);
});
afterAll(async () => db.close());

const call = async (days: number) =>
  (await db.query<{ r: Record<string, unknown> }>(`SELECT public.admin_numbers_own(${days}) AS r`))
    .rows[0]!.r as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("admin_numbers_own", () => {
  it("counts the window, today, reports and open tickets", async () => {
    const r = await call(7);
    expect(r.newWindow).toBe(4); // u1..u4 joined 2 days ago; u5 8 days ago is outside 7 days
    expect(r.newToday).toBe(0);
    expect(r.activeToday).toBe(1);
    expect(r.activeWindow).toBe(3);
    expect(r.lessons).toBe(1);
    expect(r.practiceCalls).toBe(1);
    expect(r.podcastsFinished).toBe(1); // an unfinished episode (NULL) is not counted
    expect(r.openReports).toBe(1);
    expect(r.openTickets).toBe(2); // solved is not open
  });
  it("follows the window for windowed counts", async () => {
    expect((await call(7)).lessons).toBe(1);
    expect((await call(30)).lessons).toBe(2);
    expect((await call(30)).activeWindow).toBe(4);
    expect((await call(30)).aiByKind).toEqual({ chat: 108 });
    expect((await call(7)).aiByKind).toEqual({ chat: 8 });
  });
  it("averages only streaks that are still alive", async () => {
    expect((await call(7)).avgStreak).toBe(5); // 4 and 6; the zero and the 30-day-old streak are out
  });
  it("retention is of yesterday for a cohort that joined N+1 days ago, and null (not 0) with no cohort", async () => {
    const r = (await call(7)).retention;
    expect(r.d1).toBe(75); // 3 of 4
    expect(r.d7).toBe(0); // a real cohort of 1 where nobody came back
    expect(r.d30).toBeNull(); // nobody joined 31 days ago
  });
  it("clamps an absurd window and returns only aggregates", async () => {
    const r = await call(100000);
    expect(r.newWindow).toBe(6);
    expect(JSON.stringify(r)).not.toMatch(/00000000-0000|display_name|email/);
  });
  it("only service_role may execute it", async () => {
    const p = async (role: string) =>
      (
        await db.query<{ ok: boolean }>(
          `SELECT has_function_privilege('${role}', 'public.admin_numbers_own(integer)', 'EXECUTE') AS ok`,
        )
      ).rows[0]!.ok;
    expect(await p("service_role")).toBe(true);
    expect(await p("anon")).toBe(false);
    expect(await p("authenticated")).toBe(false);
    expect(sqlText).toMatch(/SECURITY DEFINER/);
    expect(sqlText).toMatch(/SET search_path = ''/);
  });
});
