import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Reports are kept for moderation for 90 days after an account involved is deleted (20261105101000), run on real
 * Postgres (PGlite) against a fixture that reproduces the live content_reports table: both user columns reference
 * auth.users ON DELETE CASCADE, the kind/reported check, the client column grants, and the maintenance sweep as
 * 20261105100600 deployed it. Each block shows the old behaviour first, then applies the migration.
 *
 * Both deletion paths end in the same row delete: deleteMyAccount (after its RLS-scoped pre-delete loop, which does
 * not touch content_reports) and a service-role deletion (admin, dashboard) both call auth.admin.deleteUser, which
 * deletes the auth.users row. So deleting the auth.users row here is the whole contract.
 */
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

function deployedFunction(file: string, name: string): string {
  const m = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ).exec(read(file));
  if (!m) throw new Error(`${name} not found in ${file}`);
  return m[0];
}

const MIGRATION_FILE = "20261105101000_report_retention.sql";
const migration = () => read(MIGRATION_FILE);

const REPORTER = "00000000-0000-4000-8000-000000000001";
const REPORTED = "00000000-0000-4000-8000-000000000002";
const OTHER = "00000000-0000-4000-8000-000000000003";
const TEAM = "00000000-0000-4000-8000-0000000000aa";

const FIXTURE = `
  CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
  ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('app.uid', true), '')::uuid$$;
  GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;
  GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
  CREATE SCHEMA vault; CREATE TABLE vault.decrypted_secrets (name text, decrypted_secret text);
  CREATE SCHEMA net;
  CREATE FUNCTION net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) RETURNS bigint
    LANGUAGE sql AS $$ SELECT 1::bigint $$;

  INSERT INTO auth.users VALUES ('${REPORTER}', 'a@example.com'), ('${REPORTED}', 'b@example.com'),
    ('${OTHER}', 'c@example.com');
  CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, display_name text, avatar_url text);
  INSERT INTO public.profiles VALUES ('${REPORTER}', 'Ada', 'a.png'), ('${REPORTED}', 'Bea', 'b.png'),
    ('${OTHER}', 'Cy', NULL);

  -- 20260928020000 + 20261008130300 + 20261103100000, as live.
  CREATE TABLE public.content_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    reported uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
    created_at timestamptz NOT NULL DEFAULT now(),
    kind text NOT NULL DEFAULT 'user',
    context jsonb NULL,
    CHECK (reporter <> reported)
  );
  ALTER TABLE public.content_reports
    ADD CONSTRAINT content_reports_kind_chk CHECK (kind IN ('user', 'team_name', 'ai_response')),
    ADD CONSTRAINT content_reports_reported_by_kind_chk CHECK ((kind = 'ai_response') = (reported IS NULL));
  ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;
  CREATE POLICY content_reports_insert_own ON public.content_reports FOR INSERT TO authenticated
    WITH CHECK ((select auth.uid()) = reporter);
  GRANT INSERT (reporter, reported, reason, kind, context) ON public.content_reports TO authenticated;
  GRANT ALL ON public.content_reports TO service_role;

  CREATE TABLE public.content_report_delivery (
    report_id uuid PRIMARY KEY REFERENCES public.content_reports(id) ON DELETE CASCADE, notified_at timestamptz);

  CREATE TABLE public.review_grade_attempts (created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.ai_usage (user_id uuid, day date, kind text, count integer);
  CREATE TABLE public.nudges (created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.friend_activity_events (event_type text, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE public.podcast_play_events (started_at timestamptz NOT NULL DEFAULT now());
  ${deployedFunction("20261105100600_retention_and_push_secret.sql", "run_maintenance_sweep")}
`;

let db: PGlite;

async function fileReports() {
  await db.query(
    `INSERT INTO public.content_reports (reporter, reported, reason, kind, context) VALUES
       ($1, $2, 'spam', 'user', NULL),
       ($1, $2, 'rude team name', 'team_name', jsonb_build_object('team_id', $3::text)),
       ($1, NULL, 'harmful', 'ai_response', '{"message":"an AI reply","source":"chat","course":"en"}')`,
    [REPORTER, REPORTED, TEAM],
  );
}

const reports = async () =>
  (
    await db.query<{
      kind: string;
      reporter: string | null;
      reported: string | null;
      reason: string;
      context: unknown;
      account_deleted_at: string | null;
      row_text: string;
    }>(
      `SELECT kind, reporter, reported, reason, context, account_deleted_at, row_to_json(r)::text AS row_text
         FROM public.content_reports r ORDER BY kind`,
    )
  ).rows;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(FIXTURE);
});

describe("before the migration", () => {
  it("deleting either account removes every report it is part of", async () => {
    await fileReports();
    await db.query("DELETE FROM auth.users WHERE id = $1", [REPORTED]);
    expect((await db.query("SELECT kind FROM public.content_reports")).rows).toEqual([
      { kind: "ai_response" },
    ]);
    await db.query("DELETE FROM auth.users WHERE id = $1", [REPORTER]);
    expect((await db.query("SELECT 1 FROM public.content_reports")).rows).toHaveLength(0);
  });
});

describe("after the migration", () => {
  beforeEach(async () => {
    expect(existsSync(path.join(process.cwd(), "supabase/migrations", MIGRATION_FILE))).toBe(true);
    await db.exec(migration());
    await fileReports();
  });

  it("keeps reports about a deleted account, with the account reference cleared and the deletion time stamped", async () => {
    await db.query("DELETE FROM auth.users WHERE id = $1", [REPORTED]);
    const rows = await reports();
    expect(rows.map((r) => r.kind)).toEqual(["ai_response", "team_name", "user"]);
    const [ai, team, user] = rows;
    expect(user).toMatchObject({ reporter: REPORTER, reported: null, reason: "spam" });
    expect(user.account_deleted_at).not.toBeNull();
    expect(team).toMatchObject({ reported: null, context: { team_id: TEAM } });
    expect(team.account_deleted_at).not.toBeNull();
    // The AI report never named the deleted account, so nothing about it changes.
    expect(ai).toMatchObject({ reporter: REPORTER, reported: null, account_deleted_at: null });
  });

  it("keeps a deleted reporter's reports, the content snapshot included", async () => {
    await db.query("DELETE FROM auth.users WHERE id = $1", [REPORTER]);
    const rows = await reports();
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.reporter).toBeNull();
      expect(r.account_deleted_at).not.toBeNull();
    }
    expect(rows[0].context).toMatchObject({ message: "an AI reply" });
    expect(rows[2].reported).toBe(REPORTED);
  });

  it("keeps nothing from the deleted profile: no id, name, email or picture anywhere in the row", async () => {
    await db.query("DELETE FROM auth.users WHERE id = $1", [REPORTED]);
    await db.query("DELETE FROM auth.users WHERE id = $1", [REPORTER]);
    const rows = await reports();
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      for (const leaked of [
        REPORTER,
        REPORTED,
        "Ada",
        "Bea",
        "a@example.com",
        "b@example.com",
        ".png",
      ]) {
        expect(r.row_text).not.toContain(leaked);
      }
    }
    const { rows: cols } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'content_reports' ORDER BY column_name`,
    );
    expect(cols.map((c) => c.column_name)).toEqual([
      "account_deleted_at",
      "context",
      "created_at",
      "id",
      "kind",
      "reason",
      "reported",
      "reporter",
    ]);
  });

  it("keeps the first deletion time when the second account goes later", async () => {
    await db.query("DELETE FROM auth.users WHERE id = $1", [REPORTED]);
    await db.exec(
      "UPDATE public.content_reports SET account_deleted_at = '2026-01-01T00:00:00Z' WHERE kind = 'user'",
    );
    await db.query("DELETE FROM auth.users WHERE id = $1", [REPORTER]);
    const user = (await reports()).find((r) => r.kind === "user")!;
    expect(new Date(user.account_deleted_at!).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("leaves reports between two live accounts untouched when an unrelated account is deleted", async () => {
    await db.query("DELETE FROM auth.users WHERE id = $1", [OTHER]);
    for (const r of await reports()) expect(r.account_deleted_at).toBeNull();
  });

  it("the sweep deletes a kept report 90 days after the deletion, and never a report between live accounts", async () => {
    await db.query("DELETE FROM auth.users WHERE id = $1", [REPORTED]);
    await db.exec(
      `INSERT INTO public.content_report_delivery SELECT id, now() FROM public.content_reports`,
    );
    await db.exec(`
      UPDATE public.content_reports SET account_deleted_at = now() - interval '91 days' WHERE kind = 'user';
      UPDATE public.content_reports SET account_deleted_at = now() - interval '89 days' WHERE kind = 'team_name';
      UPDATE public.content_reports SET created_at = now() - interval '400 days' WHERE kind = 'ai_response';
    `);
    await db.exec("SELECT public.run_maintenance_sweep()");
    expect((await reports()).map((r) => r.kind)).toEqual(["ai_response", "team_name"]);
    expect((await db.query("SELECT 1 FROM public.content_report_delivery")).rows).toHaveLength(2);
  });

  it("the sweep still runs its earlier retention", async () => {
    await db.exec(
      `INSERT INTO public.nudges VALUES (now() - interval '91 days'), (now());
       INSERT INTO public.ai_usage VALUES (NULL, current_date - 91, 'chat', 1);`,
    );
    await db.exec("SELECT public.run_maintenance_sweep()");
    expect((await db.query("SELECT 1 FROM public.nudges")).rows).toHaveLength(1);
    expect((await db.query("SELECT 1 FROM public.ai_usage")).rows).toHaveLength(0);
  });

  describe("clients", () => {
    const asClient = async (sql: string, params: unknown[] = []) => {
      await db.exec(`SET app.uid = '${OTHER}'; SET ROLE authenticated;`);
      try {
        return await db.query(sql, params);
      } finally {
        await db.exec("RESET ROLE");
      }
    };

    it("still file the reports iOS, Android and the web send", async () => {
      await asClient("INSERT INTO public.content_reports (reported, reason) VALUES ($1, 'spam')", [
        REPORTER,
      ]);
      await asClient(
        `INSERT INTO public.content_reports (reported, reason, kind, context)
         VALUES ($1, 'x', 'team_name', '{"team_id":"t"}')`,
        [REPORTER],
      );
      await asClient(
        "INSERT INTO public.content_reports (reason, kind, context) VALUES ('bad', 'ai_response', '{}')",
      );
    });

    it("cannot set the deletion stamp (it would start the 90-day clock)", async () => {
      await expect(
        asClient(
          "INSERT INTO public.content_reports (reported, reason, account_deleted_at) VALUES ($1, 'x', now())",
          [REPORTER],
        ),
      ).rejects.toThrow(/permission denied/);
    });

    it("cannot file a person report that names nobody", async () => {
      await expect(
        asClient(
          "INSERT INTO public.content_reports (reported, reason, kind) VALUES (NULL, 'x', 'user')",
        ),
      ).rejects.toThrow(/content_reports_reported_by_kind_chk/);
    });

    it("cannot file a report with no reporter", async () => {
      await db.exec("RESET ROLE");
      await expect(
        db.query(
          "INSERT INTO public.content_reports (reporter, reason, kind) VALUES (NULL, 'x', 'ai_response')",
        ),
      ).rejects.toThrow(/content_reports_reporter_present_chk/);
    });

    it("cannot call the stamping trigger function", async () => {
      const { rows } = await db.query<{ ok: boolean }>(
        `SELECT has_function_privilege('authenticated', 'public._stamp_report_account_deleted()', 'EXECUTE') AS ok`,
      );
      expect(rows[0].ok).toBe(false);
    });
  });
});
