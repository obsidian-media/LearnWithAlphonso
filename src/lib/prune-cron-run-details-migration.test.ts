import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * 20261128110000: run_maintenance_sweep also prunes cron.job_run_details to 14 days, EXECUTED in a real Postgres
 * (PGlite) with a stand-in cron schema. The old rows go, the recent ones stay, the rest of the sweep still runs, and
 * a database with no pg_cron only warns. The sweep body is the previous one plus exactly that block.
 */
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const migration = read("20261128110000_prune_cron_run_details.sql");
const previous = read("20261128100000_hector_turn_token_uses.sql");

const sweepBody = (sql: string) =>
  sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.run_maintenance_sweep()"));

const BASE = `
  CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
  CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
  CREATE SCHEMA vault; CREATE TABLE vault.decrypted_secrets(name text, decrypted_secret text);
  CREATE SCHEMA net;
  CREATE TABLE public.app_switches(key text PRIMARY KEY, enabled boolean);
  CREATE TABLE public.ops_health_checks(service text, ok boolean, latency_ms integer, at timestamptz DEFAULT now());
  CREATE TABLE public.review_grade_attempts(created_at timestamptz);
  CREATE TABLE public.ai_usage(day date);
  CREATE TABLE public.nudges(created_at timestamptz);
  CREATE TABLE public.friend_activity_events(event_type text, created_at timestamptz);
  CREATE TABLE public.podcast_play_events(started_at timestamptz);
  CREATE TABLE public.content_reports(account_deleted_at timestamptz);
  CREATE TABLE public.lesson_session_redemptions(created_at timestamptz);
  CREATE TABLE public.ops_events(event text, created_at timestamptz);
  CREATE TABLE public.hector_turn_token_uses(expires_at timestamptz);
  CREATE FUNCTION public.support_purge_old() RETURNS void LANGUAGE sql AS 'SELECT';
`;

describe("20261128110000_prune_cron_run_details.sql (real Postgres)", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(BASE);
  }, 120_000);
  afterEach(async () => {
    await db.close();
  });

  it("the sweep is the previous body plus exactly one pg_cron block", () => {
    const next = sweepBody(migration);
    const block = next.slice(
      next.indexOf("  -- pg_cron's own run log"),
      next.indexOf("  -- Support chats:"),
    );
    expect(block).toContain(
      "DELETE FROM cron.job_run_details WHERE end_time < now() - interval '14 days'",
    );
    expect(next.replace(block, "")).toBe(sweepBody(previous));
  });

  it("deletes runs older than 14 days and keeps the recent ones", async () => {
    await db.exec(`
      CREATE SCHEMA cron;
      CREATE TABLE cron.job_run_details(runid bigserial, jobid bigint, status text, start_time timestamptz, end_time timestamptz);
      INSERT INTO cron.job_run_details(jobid, status, start_time, end_time) VALUES
        (1, 'succeeded', now() - interval '30 days', now() - interval '30 days'),
        (1, 'succeeded', now() - interval '15 days', now() - interval '15 days'),
        (1, 'succeeded', now() - interval '13 days', now() - interval '13 days'),
        (1, 'failed', now() - interval '1 hour', now() - interval '1 hour');
    `);
    await db.exec(migration);
    await db.exec("SELECT public.run_maintenance_sweep()");
    const left = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM cron.job_run_details",
    );
    expect(left.rows[0]!.n).toBe(2);
    const oldest = await db.query<{ days: number }>(
      "SELECT floor(extract(epoch FROM now() - min(end_time)) / 86400)::int AS days FROM cron.job_run_details",
    );
    expect(oldest.rows[0]!.days).toBe(13);
  });

  it("still prunes everything else when pg_cron is absent", async () => {
    await db.exec(
      "INSERT INTO public.hector_turn_token_uses VALUES (now() - interval '1 day'), (now() + interval '1 day')",
    );
    await db.exec(migration);
    await db.exec("SELECT public.run_maintenance_sweep()");
    const left = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.hector_turn_token_uses",
    );
    expect(left.rows[0]!.n).toBe(1);
  });

  it("is the newest definition of the sweep, so it cannot clobber a later one it did not copy", () => {
    const dir = path.join(process.cwd(), "supabase/migrations");
    const definers = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) =>
        /CREATE OR REPLACE FUNCTION public\.run_maintenance_sweep\(\)/.test(
          readFileSync(path.join(dir, f), "utf8"),
        ),
      )
      .sort();
    expect(definers.at(-1)).toBe("20261128110000_prune_cron_run_details.sql");
  });
});
