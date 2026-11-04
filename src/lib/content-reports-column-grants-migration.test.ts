import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

// content_reports_insert_own lets a signed-in client insert, but the table-level INSERT privilege also let it
// choose `id` and `created_at`. The report-notify trigger throttles on created_at (10 per reporter per hour), so
// a client that back-dated created_at was never counted and could flood the owner's inbox. The migration narrows
// the privilege to the columns the clients actually send.
const USER = "00000000-0000-4000-8000-000000000001";
const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261103100000_content_reports_column_grants.sql"),
  "utf8",
);

describe("content_reports column grants (real Postgres)", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT current_setting('app.uid', true)::uuid$$;
      CREATE TABLE public.content_reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter uuid NOT NULL DEFAULT auth.uid(),
        reported uuid,
        reason text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        kind text NOT NULL DEFAULT 'user',
        context jsonb
      );
      ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
      CREATE POLICY content_reports_insert_own ON public.content_reports FOR INSERT TO authenticated
        WITH CHECK ((SELECT auth.uid()) = reporter);
      GRANT USAGE ON SCHEMA auth, public TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
      GRANT INSERT, SELECT ON public.content_reports TO authenticated;  -- the live state before the migration
      GRANT ALL ON public.content_reports TO service_role;
    `);
    await db.exec(migration);
    await db.exec(`SET app.uid = '${USER}'; SET ROLE authenticated;`);
  });

  it("still accepts exactly what the iOS and Android clients send", async () => {
    await db.query("INSERT INTO public.content_reports (reported, reason) VALUES ($1, 'spam')", [
      USER,
    ]);
    await db.query(
      `INSERT INTO public.content_reports (reported, reason, kind, context)
       VALUES ($1, 'rude', 'team_name', '{"team_id":"t"}')`,
      [USER],
    );
    await db.query(
      "INSERT INTO public.content_reports (reason, kind, context) VALUES ('bad', 'ai_response', '{}')",
    );
    await db.exec("RESET ROLE");
    expect((await db.query("SELECT 1 FROM public.content_reports")).rows).toHaveLength(3);
  });

  it("refuses a client-chosen created_at (it would dodge the notify throttle)", async () => {
    await expect(
      db.query(
        "INSERT INTO public.content_reports (reported, reason, created_at) VALUES ($1, 'x', now() - interval '2 days')",
        [USER],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("no longer lets clients read reports back (no SELECT policy, so the grant was inert)", async () => {
    await expect(db.query("SELECT 1 FROM public.content_reports")).rejects.toThrow(
      /permission denied/,
    );
  });

  it("refuses a client-chosen id", async () => {
    await expect(
      db.query(
        "INSERT INTO public.content_reports (id, reported, reason) VALUES (gen_random_uuid(), $1, 'x')",
        [USER],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("still enforces reporter = auth.uid() through the policy", async () => {
    await expect(
      db.query(
        "INSERT INTO public.content_reports (reporter, reported, reason) VALUES (gen_random_uuid(), $1, 'x')",
        [USER],
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
