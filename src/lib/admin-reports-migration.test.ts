import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The Reports screen's database side (20261127150000), EXECUTED in a real Postgres (PGlite) on top of the staff console
 * migration: each of the four report actions refuses a missing, short or long reason (nothing changes, nothing is
 * recorded) and, with one, writes the reason to the audit row in the same call as the change. The old reason-free
 * signatures are gone and clients cannot call the new ones.
 */
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const STAFF_CONSOLE = read("20261113100000_staff_console.sql");
const REPORTS = read("20261127150000_admin_reports_screen.sql");

const ACTOR = "00000000-0000-4000-8000-0000000000a1";
const T1 = "00000000-0000-4000-8000-000000000001";
const REP = "00000000-0000-4000-8000-0000000000d1";
const TEAM = "00000000-0000-4000-8000-0000000000e1";

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticated; CREATE ROLE anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now());
    CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE);
    CREATE TABLE auth.refresh_tokens (id bigserial PRIMARY KEY, user_id varchar(255), session_id uuid);
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
    CREATE TABLE public.admin_users (user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, added_at timestamptz NOT NULL DEFAULT now(), added_by uuid, note text);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, display_name text);
    INSERT INTO auth.users(id) VALUES ('${ACTOR}'), ('${T1}');
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
  `);
  await db.exec(STAFF_CONSOLE);
  await db.exec(`
    CREATE TABLE public.teams (id uuid PRIMARY KEY, name text);
    CREATE TABLE public.content_reports (id uuid PRIMARY KEY, reported uuid);
    CREATE FUNCTION public.admin_reset_display_name(_user_id uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'Learner-ABCD' $$;
    CREATE FUNCTION public.admin_rename_team(_team_id uuid, _name text) RETURNS text LANGUAGE plpgsql AS $$
      BEGIN IF _name = 'bad' THEN RETURN 'blocked-content'; END IF; UPDATE public.teams SET name = _name WHERE id = _team_id; RETURN NULL; END $$;
  `);
  await db.exec(REPORTS);
}, 120_000);
afterAll(async () => {
  await db.close();
});

const asRole = async <T>(role: string, fn: () => Promise<T>, uid = "") => {
  await db.exec(`SELECT set_config('app.uid', '${uid}', false); SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("RESET ROLE; SELECT set_config('app.uid', '', false)");
  }
};
const server = <T>(fn: () => Promise<T>) => asRole("service_role", fn);
const count = async (table: string, where = "true") =>
  Number(
    (await db.query<{ n: string }>(`SELECT count(*)::text n FROM public.${table} WHERE ${where}`))
      .rows[0]!.n,
  );
const audit = (action: string) => count("staff_audit_log", `action='${action}'`);
const seed = () =>
  db.exec(`
    DELETE FROM public.teams; DELETE FROM public.content_reports;
    INSERT INTO public.teams VALUES ('${TEAM}', 'Old name');
    INSERT INTO public.content_reports VALUES ('${REP}', '${T1}');
  `);

/** The four actions, each as the SQL the server function sends, with the reason as the one varying argument. */
const ACTIONS = [
  {
    name: "report.dismiss",
    sql: "SELECT public.staff_dismiss_report($1,'support',$2,$3,$4)",
    args: (reason: string | null) => [ACTOR, T1, REP, reason],
    changed: async () => (await count("content_reports")) === 0,
  },
  {
    name: "report.reset_display_name",
    sql: "SELECT public.staff_reset_display_name($1,'support',$2,$3,$4)",
    args: (reason: string | null) => [ACTOR, T1, REP, reason],
    changed: async () => true,
  },
  {
    name: "report.rename_team",
    sql: "SELECT public.staff_rename_team($1,'support',$2,$3,$4,'New name',$5)",
    args: (reason: string | null) => [ACTOR, T1, REP, TEAM, reason],
    changed: async () => (await count("teams", "name = 'New name'")) === 1,
  },
  {
    name: "report.disband_team",
    sql: "SELECT public.staff_disband_team($1,'support',$2,$3,$4,$5)",
    args: (reason: string | null) => [ACTOR, T1, REP, TEAM, reason],
    changed: async () => (await count("teams")) === 0,
  },
] as const;

describe("report actions carry a reason (N-6)", () => {
  for (const a of ACTIONS) {
    describe(a.name, () => {
      for (const [label, bad] of [
        ["missing", null],
        ["empty", ""],
        ["blank", "   "],
        ["two characters", "ab"],
        ["501 characters", "x".repeat(501)],
      ] as const) {
        it(`refuses a ${label} reason: nothing changes, nothing is recorded`, async () => {
          await seed();
          const before = await audit(a.name);
          await expect(server(() => db.query(a.sql, [...a.args(bad)]))).rejects.toMatchObject({
            code: "22023",
          });
          expect(await audit(a.name)).toBe(before);
          expect(await count("teams")).toBe(1);
          expect(await count("teams", "name = 'Old name'")).toBe(1);
          expect(await count("content_reports")).toBe(1);
        });
      }

      it("with a reason, changes the data and writes the trimmed reason to the audit row in the same call", async () => {
        await seed();
        const before = await audit(a.name);
        await server(() => db.query(a.sql, [...a.args("  confirmed spam  ")]));
        expect(await a.changed()).toBe(true);
        expect(await audit(a.name)).toBe(before + 1);
        const row = (
          await db.query<{ reason: string; actor_user_id: string; target_user_id: string }>(
            `SELECT reason, actor_user_id, target_user_id FROM public.staff_audit_log WHERE action='${a.name}' ORDER BY id DESC LIMIT 1`,
          )
        ).rows[0]!;
        expect(row).toMatchObject({
          reason: "confirmed spam",
          actor_user_id: ACTOR,
          target_user_id: T1,
        });
      });

      it("accepts the boundary reasons: 3 and 500 characters", async () => {
        for (const reason of ["abc", "y".repeat(500)]) {
          await seed();
          await server(() => db.query(a.sql, [...a.args(reason)]));
        }
      });
    });
  }

  it("a blocked team name is still refused with no audit row (and a reason does not change that)", async () => {
    await seed();
    const before = await audit("report.rename_team");
    const r = await server(() =>
      db.query<{ r: string }>(
        "SELECT public.staff_rename_team($1,'support',$2,$3,$4,'bad',$5) AS r",
        [ACTOR, T1, REP, TEAM, "because"],
      ),
    );
    expect(r.rows[0]!.r).toBe("blocked-content");
    expect(await audit("report.rename_team")).toBe(before);
  });

  it("the old reason-free signatures no longer exist", async () => {
    const gone = [
      "SELECT public.staff_dismiss_report($1,'support',$2,$3)",
      "SELECT public.staff_reset_display_name($1,'support',$2,$3)",
      "SELECT public.staff_rename_team($1,'support',$2,$3,$4,'n')",
      "SELECT public.staff_disband_team($1,'support',$2,$3,$4)",
    ];
    for (const sql of gone) {
      await expect(
        server(() => db.query(sql, [ACTOR, T1, REP, TEAM].slice(0, sql.includes("$4") ? 4 : 3))),
      ).rejects.toMatchObject({ code: "42883" });
    }
  });

  it("clients cannot call the new functions", async () => {
    await seed();
    for (const a of ACTIONS) {
      await asRole(
        "authenticated",
        () =>
          expect(db.query(a.sql, [...a.args("a good reason")])).rejects.toMatchObject({
            code: "42501",
          }),
        ACTOR,
      );
    }
    await asRole("anon", () =>
      expect(
        db.query("SELECT public.staff_dismiss_report($1,'support',$2,$3,$4)", [
          ACTOR,
          T1,
          REP,
          "a good reason",
        ]),
      ).rejects.toMatchObject({ code: "42501" }),
    );
  });
});
