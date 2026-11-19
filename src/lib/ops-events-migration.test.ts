import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const migration = read("20261125140000_ops_events.sql");
const previousSweep = read("20261125110000_lesson_session_single_use.sql");
const USER = "00000000-0000-4000-8000-000000000001";

const deletes = (sql: string) =>
  [
    ...sql
      .slice(sql.indexOf("FUNCTION public.run_maintenance_sweep()"))
      .matchAll(/DELETE FROM public\.(\w+)/g),
  ].map((m) => m[1]);

describe("20261125140000_ops_events.sql (real Postgres)", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = new PGlite();
    // Supabase's platform default, simulated BEFORE the migration: every new table, sequence and function is open to
    // the client roles unless the migration closes it. Without this the grant assertions could not fail.
    await db.exec(`
      CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
      GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, anon, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, anon, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated, anon, service_role;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE SCHEMA vault; CREATE TABLE vault.decrypted_secrets(name text, decrypted_secret text);
      CREATE SCHEMA net;
      CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds int)
        RETURNS bigint LANGUAGE sql AS 'SELECT 1::bigint';
      CREATE TABLE public.review_grade_attempts(created_at timestamptz);
      CREATE TABLE public.ai_usage(day date);
      CREATE TABLE public.nudges(created_at timestamptz);
      CREATE TABLE public.friend_activity_events(event_type text, created_at timestamptz);
      CREATE TABLE public.podcast_play_events(started_at timestamptz);
      CREATE TABLE public.content_reports(account_deleted_at timestamptz);
      CREATE TABLE public.lesson_session_redemptions(created_at timestamptz);
      CREATE FUNCTION public.support_purge_old() RETURNS void LANGUAGE sql AS 'SELECT';
    `);
    await db.exec(migration);
    await db.query("INSERT INTO auth.users(id) VALUES ($1)", [USER]);
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

  it("clients hold nothing on either table, the sequence or the functions; service_role can use them", async () => {
    for (const t of ["public.ops_events", "public.ops_event_alerts"]) {
      for (const role of ["anon", "authenticated"]) {
        for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
          expect(await tablePriv(role, t, p), `${role} ${p} ${t}`).toBe(false);
        }
      }
      expect(await tablePriv("service_role", t, "INSERT")).toBe(true);
    }
    for (const role of ["anon", "authenticated"]) {
      const seq = await db.query<{ ok: boolean }>(
        `SELECT has_sequence_privilege($1,'public.ops_events_id_seq','USAGE') AS ok`,
        [role],
      );
      expect(seq.rows[0]!.ok, `${role} sequence`).toBe(false);
      for (const fn of ["public.ops_events_summary()", "public.run_maintenance_sweep()"]) {
        expect(await fnPriv(role, fn), `${role} ${fn}`).toBe(false);
      }
    }
    expect(await fnPriv("service_role", "public.ops_events_summary()")).toBe(true);
    const rls = await db.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname IN ('ops_events','ops_event_alerts')`,
    );
    expect(rls.rows.map((r) => r.relrowsecurity)).toEqual([true, true]);
  });

  it("the event name and the detail size are constrained", async () => {
    const ins = (event: string, detail: object) =>
      db.query(`INSERT INTO public.ops_events(event, source, detail) VALUES ($1,'web',$2::jsonb)`, [
        event,
        JSON.stringify(detail),
      ]);
    await expect(ins("hearts_settlement_failed", { fn: "x" })).resolves.toBeDefined();
    await expect(ins("Bad Event!", {})).rejects.toThrow();
    await expect(ins("a".repeat(65), {})).rejects.toThrow();
    await expect(ins("big_detail", { s: "x".repeat(2100) })).rejects.toThrow();
  });

  it("a deleted account keeps the event, with the learner cleared", async () => {
    await db.query(`INSERT INTO public.ops_events(event, source, user_id) VALUES ('e1','web',$1)`, [
      USER,
    ]);
    await db.query(`DELETE FROM auth.users WHERE id=$1`, [USER]);
    const r = await db.query<{ user_id: string | null }>(`SELECT user_id FROM public.ops_events`);
    expect(r.rows).toEqual([{ user_id: null }]);
  });

  it("the summary counts the last hour, 24 hours and 7 days per event", async () => {
    await db.exec(`
      INSERT INTO public.ops_events(event, source, created_at) VALUES
        ('a','web', now() - interval '10 minutes'),
        ('a','web', now() - interval '5 hours'),
        ('a','web', now() - interval '3 days'),
        ('a','web', now() - interval '9 days'),
        ('b','web', now() - interval '2 days');
    `);
    const r = await db.query<{
      event: string;
      count_1h: string;
      count_24h: string;
      count_7d: string;
    }>(
      `SELECT event, count_1h, count_24h, count_7d FROM public.ops_events_summary() ORDER BY event`,
    );
    expect(
      r.rows.map((x) => [x.event, Number(x.count_1h), Number(x.count_24h), Number(x.count_7d)]),
    ).toEqual([
      ["a", 1, 2, 3],
      ["b", 0, 0, 1],
    ]);
  });

  it("the sweep deletes events older than 90 days and keeps every step it had before", async () => {
    await db.exec(`
      INSERT INTO public.ops_events(event, source, created_at) VALUES
        ('old','web', now() - interval '91 days'), ('new','web', now() - interval '89 days');
    `);
    await db.exec(`SELECT public.run_maintenance_sweep()`);
    const r = await db.query<{ event: string }>(`SELECT event FROM public.ops_events`);
    expect(r.rows.map((x) => x.event)).toEqual(["new"]);
    const before = deletes(previousSweep);
    const after = deletes(migration);
    for (const t of before) expect(after, t).toContain(t);
    expect(after).toContain("ops_events");
    expect(after.length).toBe(before.length + 1);
    for (const keep of ["support_purge_old", "report_notify_secret", "api/internal/maintenance"]) {
      expect(migration, keep).toContain(keep);
    }
  });
});
