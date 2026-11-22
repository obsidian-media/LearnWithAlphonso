import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The Audit screen's database side (20261127160000), EXECUTED in a real Postgres (PGlite) on top of the staff console
 * migration: the actors list holds staff only (explicit and implicit owners, support, a suspended person), only people
 * who actually appear in the record, no learner and no unattributed row, and only service_role may call it.
 */
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const STAFF_CONSOLE = read("20261113100000_staff_console.sql");
const AUDIT_SCREEN = read("20261127160000_admin_audit_screen.sql");

const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWN = id(1); // explicit owner, named
const IMPL = id(2); // implicit owner (admin_users only), no profile
const SUP = id(3); // support, named
const DIS = id(4); // suspended support
const QUIET = id(5); // staff who never acted
const LEARNER = id(6); // a learner who somehow is an actor id in the record
const GONE = id(7); // a former staff member (no staff row any more)

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticated; CREATE ROLE anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now(), last_sign_in_at timestamptz);
    CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE);
    CREATE TABLE auth.refresh_tokens (id bigserial PRIMARY KEY, user_id varchar(255), session_id uuid);
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
    CREATE TABLE public.admin_users (user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, added_at timestamptz NOT NULL DEFAULT now(), added_by uuid, note text);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, display_name text);
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
  `);
  await db.exec(STAFF_CONSOLE);
  await db.exec(AUDIT_SCREEN);
  await db.exec(`
    INSERT INTO auth.users(id, email) VALUES
      ('${OWN}','own@example.com'), ('${IMPL}','impl@example.com'), ('${SUP}','sup@example.com'),
      ('${DIS}','dis@example.com'), ('${QUIET}','quiet@example.com'), ('${LEARNER}','learner@example.com'),
      ('${GONE}','gone@example.com');
    INSERT INTO public.profiles VALUES ('${OWN}','Olive'), ('${SUP}','Sam'), ('${DIS}','Dee'),
      ('${LEARNER}','A Learner'), ('${GONE}','Gone');
    INSERT INTO public.admin_users(user_id) VALUES ('${OWN}'), ('${IMPL}'), ('${SUP}'), ('${DIS}'), ('${QUIET}');
    INSERT INTO public.staff_roles(user_id, role, scopes) VALUES
      ('${OWN}','owner','{}'), ('${SUP}','support','{users.read}'), ('${DIS}','support','{users.read}'),
      ('${QUIET}','support','{users.read}');
    UPDATE public.staff_roles SET disabled_at = now() WHERE user_id = '${DIS}';
    SELECT public.staff_record('${OWN}','owner','user.ban','${LEARNER}','spam',NULL,NULL,NULL);
    SELECT public.staff_record('${OWN}','owner','staff.add','${SUP}','new hire',NULL,NULL,NULL);
    SELECT public.staff_record('${IMPL}','owner','user.view','${LEARNER}',NULL,NULL,NULL,NULL);
    SELECT public.staff_record('${SUP}','support','support.reply','${LEARNER}',NULL,NULL,NULL,NULL);
    SELECT public.staff_record('${DIS}','support','user.block','${LEARNER}','spam',NULL,NULL,NULL);
    SELECT public.staff_record('${LEARNER}','support','user.view','${OWN}',NULL,NULL,NULL,NULL);
    SELECT public.staff_record('${GONE}','support','user.view','${LEARNER}',NULL,NULL,NULL,NULL);
    SELECT public.staff_record(NULL,'support_ai','support.reply','${LEARNER}',NULL,NULL,NULL,NULL);
  `);
}, 120_000);
afterAll(async () => {
  await db.close();
});

type Actor = { user_id: string; display_name: string | null; role: string; disabled: boolean };
const actors = async () => {
  await db.exec("SET ROLE service_role");
  try {
    return (await db.query<Actor>("SELECT * FROM public.staff_audit_actors()")).rows;
  } finally {
    await db.exec("RESET ROLE");
  }
};

describe("staff_audit_actors (N-9)", () => {
  it("lists exactly the current staff who appear in the record, ordered by name", async () => {
    const rows = await actors();
    // The implicit owner has no profile so sorts first (empty name), then Dee, Olive, Sam.
    expect(rows.map((r) => r.user_id)).toEqual([IMPL, DIS, OWN, SUP]);
  });

  it("has no learner, no former member, no staff who never acted and no unattributed row", async () => {
    const ids = (await actors()).map((r) => r.user_id);
    expect(ids).not.toContain(LEARNER);
    expect(ids).not.toContain(GONE);
    expect(ids).not.toContain(QUIET);
    expect(ids).not.toContain(null as unknown as string);
  });

  it("returns the display name (null when there is none), the current role and the suspended flag", async () => {
    const rows = await actors();
    const by = (u: string) => rows.find((r) => r.user_id === u)!;
    expect(by(OWN)).toMatchObject({ display_name: "Olive", role: "owner", disabled: false });
    expect(by(IMPL)).toMatchObject({ display_name: null, role: "owner", disabled: false });
    expect(by(SUP)).toMatchObject({ display_name: "Sam", role: "support", disabled: false });
    expect(by(DIS)).toMatchObject({ display_name: "Dee", role: "support", disabled: true });
  });

  it("returns only the four named columns, never an email or a learner field", async () => {
    const row = (await actors())[0]!;
    expect(Object.keys(row).sort()).toEqual(["disabled", "display_name", "role", "user_id"]);
  });

  it("is callable by service_role only, and is a hardened SECURITY DEFINER function", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      await expect(db.query("SELECT * FROM public.staff_audit_actors()")).rejects.toThrow(
        /permission denied/i,
      );
      await db.exec("RESET ROLE");
    }
    const meta = (
      await db.query<{ definer: boolean; cfg: string[] | null }>(
        `SELECT prosecdef AS definer, proconfig AS cfg FROM pg_proc WHERE proname = 'staff_audit_actors'`,
      )
    ).rows[0]!;
    expect(meta.definer).toBe(true);
    expect((meta.cfg ?? []).join(",")).toContain("search_path=");
  });

  it("follows the record: a new actor appears once they act, and the log stays append-only", async () => {
    await db.exec(
      `SELECT public.staff_record('${QUIET}','support','support.note','${LEARNER}','n',NULL,NULL,NULL)`,
    );
    expect((await actors()).map((r) => r.user_id)).toContain(QUIET);
    await expect(db.exec("DELETE FROM public.staff_audit_log")).rejects.toThrow(/append-only/);
  });
});
