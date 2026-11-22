import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * The Health screen's database side (20261127170000), EXECUTED in a real Postgres (PGlite): the history table is closed
 * to clients, the maintenance sweep writes the two probe rows (and records a failing probe as ok = false without
 * stopping the pruning), keeps every step it had, deletes history after 120 days, and the three read functions answer
 * from real rows only (nothing is invented when there are none).
 */
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const migration = read("20261127170000_admin_health_screen.sql");
const previousSweep = read("20261125140000_ops_events.sql");

const deletes = (sql: string) =>
  [
    ...sql
      .slice(sql.indexOf("FUNCTION public.run_maintenance_sweep()"))
      .matchAll(/DELETE FROM public\.(\w+)/g),
  ].map((m) => m[1]);

describe("20261127170000_admin_health_screen.sql (real Postgres)", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = new PGlite();
    // Supabase's platform default, simulated BEFORE the migration, so the closed-to-clients assertions can fail.
    await db.exec(`
      CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
      GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, anon, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated, anon, service_role;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE SCHEMA vault; CREATE TABLE vault.decrypted_secrets(name text, decrypted_secret text);
      CREATE SCHEMA net;
      CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int)
        RETURNS bigint LANGUAGE sql AS 'SELECT 1::bigint';
      CREATE SCHEMA cron;
      CREATE TABLE cron.job(jobid bigint PRIMARY KEY, jobname text);
      CREATE TABLE cron.job_run_details(runid bigserial PRIMARY KEY, jobid bigint, status text, start_time timestamptz);
      CREATE TABLE public.app_switches(key text PRIMARY KEY, enabled boolean);
      CREATE TABLE public.review_grade_attempts(created_at timestamptz);
      CREATE TABLE public.ai_usage(day date);
      CREATE TABLE public.nudges(created_at timestamptz);
      CREATE TABLE public.friend_activity_events(event_type text, created_at timestamptz);
      CREATE TABLE public.podcast_play_events(started_at timestamptz);
      CREATE TABLE public.content_reports(account_deleted_at timestamptz);
      CREATE TABLE public.lesson_session_redemptions(created_at timestamptz);
      CREATE TABLE public.ops_events(event text, created_at timestamptz);
      CREATE FUNCTION public.support_purge_old() RETURNS void LANGUAGE sql AS 'SELECT';
    `);
    await db.exec(migration);
  }, 120_000);
  afterEach(async () => {
    await db.close();
  });

  const tablePriv = async (role: string, rel: string, p: string) =>
    (
      await db.query<{ ok: boolean }>(`SELECT has_table_privilege($1, $2, $3) AS ok`, [
        role,
        rel,
        p,
      ])
    ).rows[0]!.ok;
  const fnPriv = async (role: string, fn: string) =>
    (
      await db.query<{ ok: boolean }>(`SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok`, [
        role,
        fn,
      ])
    ).rows[0]!.ok;
  const checks = async () =>
    (
      await db.query<{ service: string; ok: boolean; latency_ms: number | null }>(
        `SELECT service, ok, latency_ms FROM public.ops_health_checks ORDER BY service, at`,
      )
    ).rows;

  it("clients hold nothing on the table or the functions; service_role can use them; row security is on", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"])
        expect(await tablePriv(role, "public.ops_health_checks", p), `${role} ${p}`).toBe(false);
      for (const fn of [
        "public.staff_sweep_status()",
        "public.staff_health_summary()",
        "public.staff_health_history(integer)",
        "public.run_maintenance_sweep()",
      ])
        expect(await fnPriv(role, fn), `${role} ${fn}`).toBe(false);
    }
    for (const p of ["SELECT", "INSERT", "DELETE"])
      expect(await tablePriv("service_role", "public.ops_health_checks", p)).toBe(true);
    for (const fn of [
      "public.staff_sweep_status()",
      "public.staff_health_summary()",
      "public.staff_health_history(integer)",
    ])
      expect(await fnPriv("service_role", fn), fn).toBe(true);
    const rls = await db.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'ops_health_checks'`,
    );
    expect(rls.rows[0]!.relrowsecurity).toBe(true);
  });

  it("the new functions are SECURITY DEFINER with an empty search_path", async () => {
    const r = await db.query<{ proname: string; prosecdef: boolean; cfg: string[] | null }>(
      `SELECT proname, prosecdef, proconfig AS cfg FROM pg_proc
        WHERE proname IN ('staff_sweep_status','staff_health_summary','staff_health_history','run_maintenance_sweep')`,
    );
    expect(r.rows).toHaveLength(4);
    for (const f of r.rows) {
      expect(f.prosecdef, f.proname).toBe(true);
      expect(f.cfg, f.proname).toContain('search_path=""');
    }
  });

  it("only the two services the database can probe are accepted", async () => {
    await expect(
      db.exec(`INSERT INTO public.ops_health_checks(service, ok) VALUES ('web', true)`),
    ).rejects.toThrow();
  });

  it("the sweep writes one database and one auth row with a real latency", async () => {
    await db.exec(`SELECT public.run_maintenance_sweep()`);
    const rows = await checks();
    expect(rows.map((r) => r.service)).toEqual(["auth", "database"]);
    for (const r of rows) {
      expect(r.ok).toBe(true);
      expect(r.latency_ms).toBeGreaterThanOrEqual(0);
    }
  });

  it("a failing probe is recorded as ok = false with no latency, and the pruning still runs", async () => {
    await db.exec(`
      DROP TABLE auth.users;
      INSERT INTO public.ops_events(event, created_at) VALUES ('old', now() - interval '91 days'), ('new', now());
    `);
    await db.exec(`SELECT public.run_maintenance_sweep()`);
    const rows = await checks();
    expect(rows).toEqual([
      { service: "auth", ok: false, latency_ms: null },
      { service: "database", ok: true, latency_ms: expect.any(Number) },
    ]);
    const ev = await db.query<{ event: string }>(`SELECT event FROM public.ops_events`);
    expect(ev.rows.map((r) => r.event)).toEqual(["new"]);
  });

  it("deletes history older than 120 days and keeps newer rows", async () => {
    await db.exec(`
      INSERT INTO public.ops_health_checks(service, ok, latency_ms, at) VALUES
        ('database', true, 3, now() - interval '121 days'),
        ('database', true, 3, now() - interval '119 days');
    `);
    await db.exec(`SELECT public.run_maintenance_sweep()`);
    const r = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.ops_health_checks WHERE at < now() - interval '1 day'`,
    );
    expect(r.rows[0]!.n).toBe(1);
  });

  it("staff_sweep_status is plpgsql, so the migration applies where pg_cron does not exist (history replays)", async () => {
    const r = await db.query<{ lang: string }>(
      `SELECT l.lanname AS lang FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.proname = 'staff_sweep_status'`,
    );
    expect(r.rows[0]!.lang).toBe("plpgsql");
    const bare = new PGlite();
    await bare.exec(`
      CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE SCHEMA vault; CREATE SCHEMA net;
      CREATE TABLE public.app_switches(key text PRIMARY KEY, enabled boolean);
      CREATE TABLE public.review_grade_attempts(created_at timestamptz);
      CREATE TABLE public.ai_usage(day date);
      CREATE TABLE public.nudges(created_at timestamptz);
      CREATE TABLE public.friend_activity_events(event_type text, created_at timestamptz);
      CREATE TABLE public.podcast_play_events(started_at timestamptz);
      CREATE TABLE public.content_reports(account_deleted_at timestamptz);
      CREATE TABLE public.lesson_session_redemptions(created_at timestamptz);
      CREATE TABLE public.ops_events(event text, created_at timestamptz);
      CREATE FUNCTION public.support_purge_old() RETURNS void LANGUAGE sql AS 'SELECT';
    `);
    await expect(bare.exec(migration)).resolves.toBeDefined();
    await bare.close();
  });

  it("keeps every step the previous sweep had", () => {
    const before = deletes(previousSweep);
    const after = deletes(migration);
    for (const t of before) expect(after, t).toContain(t);
    expect(after.length).toBe(before.length + 1);
    expect(after).toContain("ops_health_checks");
    for (const keep of ["support_purge_old", "report_notify_secret", "api/internal/maintenance"])
      expect(migration, keep).toContain(keep);
  });

  describe("staff_sweep_status reads the job log", () => {
    const status = async () =>
      (
        await db.query<{
          scheduled: boolean;
          last_run_at: string | null;
          last_status: string | null;
          last_ok_at: string | null;
          runs_24h: number;
          failed_24h: number;
        }>(`SELECT * FROM public.staff_sweep_status()`)
      ).rows[0]!;

    it("with no job it says not scheduled and invents no run", async () => {
      expect(await status()).toEqual({
        scheduled: false,
        last_run_at: null,
        last_status: null,
        last_ok_at: null,
        runs_24h: 0,
        failed_24h: 0,
      });
    });

    it("with a job and no runs it is scheduled with nothing recorded", async () => {
      await db.exec(`INSERT INTO cron.job VALUES (1, 'maintenance-sweep')`);
      const s = await status();
      expect(s.scheduled).toBe(true);
      expect(s.last_run_at).toBeNull();
      expect(s.runs_24h).toBe(0);
    });

    it("counts only finished runs of the maintenance job in the last 24 hours, and reports the last result", async () => {
      await db.exec(`
        INSERT INTO cron.job VALUES (1, 'maintenance-sweep'), (2, 'other-job');
        INSERT INTO cron.job_run_details(jobid, status, start_time) VALUES
          (1, 'succeeded', now() - interval '3 hours'),
          (1, 'failed',    now() - interval '2 hours'),
          (1, 'succeeded', now() - interval '30 hours'),
          (1, 'running',   now() - interval '1 minute'),
          (2, 'failed',    now() - interval '10 minutes');
      `);
      const s = await status();
      expect(s.runs_24h).toBe(2);
      expect(s.failed_24h).toBe(1);
      expect(s.last_status).toBe("failed");
      expect(new Date(s.last_run_at!).getTime()).toBeGreaterThan(Date.now() - 3 * 3600_000);
      expect(new Date(s.last_ok_at!).getTime()).toBeLessThan(Date.now() - 2.5 * 3600_000);
    });
  });

  describe("staff_health_summary and staff_health_history", () => {
    it("with no rows they return nothing at all", async () => {
      expect((await db.query(`SELECT * FROM public.staff_health_summary()`)).rows).toEqual([]);
      expect((await db.query(`SELECT * FROM public.staff_health_history(90)`)).rows).toEqual([]);
    });

    it("the summary gives each service its first check and its last result", async () => {
      await db.exec(`
        INSERT INTO public.ops_health_checks(service, ok, latency_ms, at) VALUES
          ('database', true, 5, now() - interval '3 days'),
          ('database', false, NULL, now() - interval '1 hour'),
          ('auth', true, 7, now() - interval '2 days');
      `);
      const r = await db.query<{
        service: string;
        last_ok: boolean;
        last_latency_ms: number | null;
      }>(`SELECT * FROM public.staff_health_summary() ORDER BY service`);
      expect(r.rows.map((x) => [x.service, x.last_ok, x.last_latency_ms])).toEqual([
        ["auth", true, 7],
        ["database", false, null],
      ]);
    });

    it("the history groups by service and UTC day, counts passes, and leaves days with no rows out", async () => {
      await db.exec(`
        INSERT INTO public.ops_health_checks(service, ok, latency_ms, at) VALUES
          ('database', true, 5, date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '2 hours'),
          ('database', false, NULL, date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '3 hours'),
          ('database', true, 5, date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '3 days'),
          ('database', true, 5, now() - interval '100 days');
      `);
      const r = await db.query<{ day: Date | string; checks: number; ok_checks: number }>(
        `SELECT day, checks, ok_checks FROM public.staff_health_history(90)`,
      );
      expect(r.rows).toHaveLength(2);
      expect(r.rows.map((x) => [x.checks, x.ok_checks])).toEqual([
        [1, 1],
        [2, 1],
      ]);
    });

    it("clamps the window to 1..120 days and treats NULL as 90", async () => {
      await db.exec(`
        INSERT INTO public.ops_health_checks(service, ok, latency_ms, at) VALUES
          ('database', true, 5, now() - interval '100 days'),
          ('database', true, 5, now() - interval '130 days'),
          ('database', true, 5, now());
      `);
      const n = async (arg: string) =>
        (await db.query(`SELECT * FROM public.staff_health_history(${arg})`)).rows.length;
      expect(await n("1")).toBe(1);
      expect(await n("0")).toBe(1);
      expect(await n("90")).toBe(1);
      expect(await n("NULL")).toBe(1);
      expect(await n("500")).toBe(2);
    });
  });
});
