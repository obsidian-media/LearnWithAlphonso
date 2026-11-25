import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * 20261128100000: the Hector turn token's use counter, EXECUTED in a real Postgres (PGlite). Two uses per (token, part)
 * are allowed and the third is refused; parts count separately; a refused call is not counted; clients hold nothing;
 * and the maintenance sweep deletes expired rows (and keeps the live ones).
 */
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const migration = read("20261128100000_hector_turn_token_uses.sql");
const previousSweep = read("20261127170000_admin_health_screen.sql");

const HASH = "a".repeat(64);
const OTHER = "b".repeat(64);
const inOneHour = "now() + interval '1 hour'";

describe("20261128100000_hector_turn_token_uses.sql (real Postgres)", () => {
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
      CREATE FUNCTION public.support_purge_old() RETURNS void LANGUAGE sql AS 'SELECT';
    `);
    await db.exec(migration);
  }, 120_000);
  afterEach(async () => {
    await db.close();
  });

  const consume = async (hash: string, part: number, max = 2) =>
    (
      await db.query<{ ok: boolean }>(
        `SELECT public.consume_hector_turn_use($1, $2, $3, ${inOneHour}) AS ok`,
        [hash, part, max],
      )
    ).rows[0]!.ok;
  const uses = async (hash: string, part: number) =>
    (
      await db.query<{ uses: number }>(
        `SELECT uses FROM public.hector_turn_token_uses WHERE sig_hash = $1 AND part = $2`,
        [hash, part],
      )
    ).rows[0]?.uses;

  it("allows two uses of a part and refuses the third", async () => {
    expect(await consume(HASH, 0)).toBe(true);
    expect(await consume(HASH, 0)).toBe(true);
    expect(await consume(HASH, 0)).toBe(false);
    expect(await consume(HASH, 0)).toBe(false);
  });

  it("a refused call is not counted, so the stored count stops at the cap", async () => {
    for (let i = 0; i < 5; i += 1) await consume(HASH, 0);
    expect(await uses(HASH, 0)).toBe(2);
  });

  it("each part, and each token, has its own allowance", async () => {
    await consume(HASH, 0);
    await consume(HASH, 0);
    expect(await consume(HASH, 0)).toBe(false);
    expect(await consume(HASH, 1)).toBe(true);
    expect(await consume(OTHER, 0)).toBe(true);
  });

  it("the cap is the caller's p_max", async () => {
    expect(await consume(HASH, 0, 1)).toBe(true);
    expect(await consume(HASH, 0, 1)).toBe(false);
  });

  it("rejects arguments that are not a token hash, a part or a cap", async () => {
    for (const [hash, part, max] of [
      ["not-a-hash", 0, 2],
      [HASH, -1, 2],
      [HASH, 9, 2],
      [HASH, 0, 0],
    ] as const) {
      await expect(consume(hash, part, max)).rejects.toThrow();
    }
  });

  it("clients hold nothing on the table or the function; service_role can use them; row security is on", async () => {
    const tablePriv = async (role: string, p: string) =>
      (
        await db.query<{ ok: boolean }>(`SELECT has_table_privilege($1, $2, $3) AS ok`, [
          role,
          "public.hector_turn_token_uses",
          p,
        ])
      ).rows[0]!.ok;
    const fnPriv = async (role: string) =>
      (
        await db.query<{ ok: boolean }>(`SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok`, [
          role,
          "public.consume_hector_turn_use(text, integer, integer, timestamptz)",
        ])
      ).rows[0]!.ok;
    for (const role of ["anon", "authenticated"]) {
      for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE"])
        expect(await tablePriv(role, p), `${role} ${p}`).toBe(false);
      expect(await fnPriv(role), role).toBe(false);
    }
    expect(await fnPriv("service_role")).toBe(true);
    expect(await tablePriv("service_role", "SELECT")).toBe(true);
    const rls = await db.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'hector_turn_token_uses'`,
    );
    expect(rls.rows[0]!.relrowsecurity).toBe(true);
  });

  it("the function is SECURITY DEFINER with an empty search_path", async () => {
    const r = await db.query<{ prosecdef: boolean; cfg: string[] | null }>(
      `SELECT prosecdef, proconfig AS cfg FROM pg_proc WHERE proname = 'consume_hector_turn_use'`,
    );
    expect(r.rows[0]!.prosecdef).toBe(true);
    expect(r.rows[0]!.cfg).toContain('search_path=""');
  });

  it("the maintenance sweep deletes expired rows and keeps live ones", async () => {
    await db.exec(`
      INSERT INTO public.hector_turn_token_uses (sig_hash, part, uses, expires_at)
        VALUES ('${HASH}', 0, 2, now() - interval '1 minute'),
               ('${OTHER}', 0, 1, now() + interval '1 hour');
    `);
    await db.exec(`SELECT public.run_maintenance_sweep()`);
    const left = await db.query<{ sig_hash: string }>(
      `SELECT sig_hash FROM public.hector_turn_token_uses`,
    );
    expect(left.rows.map((r) => r.sig_hash)).toEqual([OTHER]);
  });

  it("the redefined sweep is the previous one plus exactly this table's DELETE (nothing else was dropped)", () => {
    const body = (sql: string) =>
      sql.slice(
        sql.indexOf("CREATE OR REPLACE FUNCTION public.run_maintenance_sweep()"),
        sql.indexOf("GRANT EXECUTE ON FUNCTION public.run_maintenance_sweep() TO service_role;"),
      );
    const before = body(previousSweep).replace(/\r\n/g, "\n");
    const after = body(migration).replace(/\r\n/g, "\n");
    const added = after
      .split("\n")
      .filter((line) => !before.split("\n").includes(line))
      .join("\n");
    expect(added).toContain("DELETE FROM public.hector_turn_token_uses WHERE expires_at < now();");
    // Every line the previous sweep had is still there.
    for (const line of before.split("\n")) expect(after.split("\n")).toContain(line);
  });

  it("was copied in full by the next sweep definition, so nothing was lost since", () => {
    const dir = path.join(process.cwd(), "supabase/migrations");
    const definers = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) =>
        /CREATE OR REPLACE FUNCTION public\.run_maintenance_sweep\(\)/.test(
          readFileSync(path.join(dir, f), "utf8"),
        ),
      )
      .sort();
    // 20261128110000 redefines it with this body plus one block (prune-cron-run-details-migration.test.ts checks that).
    expect(definers.at(-1)).toBe("20261128110000_prune_cron_run_details.sql");
    expect(definers.at(-2)).toBe("20261128100000_hector_turn_token_uses.sql");
    expect(definers.at(-3)).toBe("20261127170000_admin_health_screen.sql");
  });
});
