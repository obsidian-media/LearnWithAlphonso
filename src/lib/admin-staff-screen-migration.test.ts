import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * The Staff screen's database side (20261127140000), EXECUTED in a real Postgres (PGlite) on top of the staff console
 * migration: the staff list with sign-in email and last sign-in (staff rows only, owner only), the active-owner rule on
 * add and update, the last-owner guard, and the refusals, each with its audit row (or none).
 */
const read = (f: string) =>
  readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const STAFF_CONSOLE = read("20261113100000_staff_console.sql");
const STAFF_SCREEN = read("20261127140000_admin_staff_screen.sql");

const id = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNA = id(1); // explicit owner
const OWNB = id(2); // explicit owner
const IMPL = id(3); // implicit owner: admin_users, no staff_roles row
const SUP = id(4); // support
const DIS = id(5); // disabled support
const NEWB = id(6); // an account, not staff
const NEVER = id(7); // support who never signed in
const LEARNER = id(8); // a learner, not staff

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
  await db.exec(STAFF_SCREEN);
  await db.exec(`
    INSERT INTO auth.users(id, email, last_sign_in_at) VALUES
      ('${OWNA}', 'owna@example.com', timestamptz '2026-11-20T09:00:00Z'),
      ('${OWNB}', 'ownb@example.com', timestamptz '2026-11-19T09:00:00Z'),
      ('${IMPL}', 'impl@example.com', timestamptz '2026-11-18T09:00:00Z'),
      ('${SUP}', 'sup@example.com', timestamptz '2026-11-17T09:00:00Z'),
      ('${DIS}', 'dis@example.com', timestamptz '2026-11-16T09:00:00Z'),
      ('${NEWB}', 'newb@example.com', NULL),
      ('${NEVER}', 'never@example.com', NULL),
      ('${LEARNER}', 'learner@example.com', timestamptz '2026-11-15T09:00:00Z');
    INSERT INTO public.profiles VALUES ('${OWNA}', 'Olive'), ('${SUP}', 'Sam');
    INSERT INTO public.admin_users(user_id, added_at) VALUES
      ('${OWNA}', '2026-01-01'), ('${OWNB}', '2026-01-02'), ('${IMPL}', '2026-01-03'),
      ('${SUP}', '2026-01-04'), ('${DIS}', '2026-01-05'), ('${NEVER}', '2026-01-06');
    INSERT INTO public.staff_roles(user_id, role, scopes, added_at) VALUES
      ('${OWNA}', 'owner', '{}', '2026-01-01'), ('${OWNB}', 'owner', '{}', '2026-01-02'),
      ('${SUP}', 'support', '{users.read,support.read}', '2026-01-04'),
      ('${DIS}', 'support', '{users.read}', '2026-01-05'),
      ('${NEVER}', 'support', '{users.read}', '2026-01-06');
    UPDATE public.staff_roles SET disabled_at = now() WHERE user_id = '${DIS}';
  `);
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
const audit = async (where = "true") =>
  (
    await db.query<{
      action: string;
      actor_user_id: string;
      actor_role: string;
      target_user_id: string;
      reason: string;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
    }>(
      `SELECT action, actor_user_id, actor_role, target_user_id, reason, before, after
         FROM public.staff_audit_log WHERE action LIKE 'staff.%' AND ${where} ORDER BY id`,
    )
  ).rows;
const roleRow = async (u: string) =>
  (
    await db.query<{ role: string; scopes: string[]; disabled: boolean }>(
      `SELECT role, scopes, disabled_at IS NOT NULL AS disabled FROM public.staff_roles WHERE user_id='${u}'`,
    )
  ).rows[0];
const add = (args: unknown[]) =>
  server(() => db.query("SELECT public.staff_add_member($1,'owner',$2,$3,$4::text[],$5)", args));
const upd = (args: unknown[]) =>
  server(() =>
    db.query("SELECT public.staff_update_member($1,'owner',$2,$3,$4::text[],$5,$6)", args),
  );

describe("staff_list_members (N-10)", () => {
  it("returns every staff row with email and last sign-in, an implicit owner included, and no learner", async () => {
    const rows = (
      await server(() =>
        db.query<{
          user_id: string;
          email: string;
          display_name: string | null;
          role: string;
          disabled_at: string | null;
          last_sign_in_at: string | null;
        }>("SELECT * FROM public.staff_list_members($1)", [OWNA]),
      )
    ).rows;
    expect(rows.map((r) => r.user_id)).toEqual([OWNA, OWNB, IMPL, SUP, DIS, NEVER]);
    expect(rows.find((r) => r.user_id === LEARNER)).toBeUndefined();
    expect(rows.find((r) => r.user_id === NEWB)).toBeUndefined();
    const impl = rows.find((r) => r.user_id === IMPL)!;
    expect(impl.role).toBe("owner");
    expect(impl.email).toBe("impl@example.com");
    expect(rows.find((r) => r.user_id === OWNA)!.display_name).toBe("Olive");
    expect(rows.find((r) => r.user_id === DIS)!.disabled_at).not.toBeNull();
    expect(new Date(rows.find((r) => r.user_id === SUP)!.last_sign_in_at!).toISOString()).toBe(
      "2026-11-17T09:00:00.000Z",
    );
  });

  it("a person who never signed in comes back with a NULL last sign-in, not a date", async () => {
    const r = (
      await server(() =>
        db.query<{ last_sign_in_at: string | null }>(
          "SELECT last_sign_in_at FROM public.staff_list_members($1) WHERE user_id = $2",
          [OWNA, NEVER],
        ),
      )
    ).rows[0]!;
    expect(r.last_sign_in_at).toBeNull();
  });

  it("is refused to support, to a disabled owner, to a non-staff account, and to no actor", async () => {
    for (const actor of [SUP, DIS, LEARNER, null]) {
      await server(() =>
        expect(
          db.query("SELECT * FROM public.staff_list_members($1)", [actor]),
        ).rejects.toMatchObject({ code: "42501" }),
      );
    }
  });

  it("is not callable by clients (authenticated or anon), even as an owner", async () => {
    for (const role of ["authenticated", "anon"]) {
      await asRole(
        role,
        () =>
          expect(
            db.query(`SELECT * FROM public.staff_list_members('${OWNA}')`),
          ).rejects.toMatchObject({ code: "42501" }),
        OWNA,
      );
    }
  });
});

describe("staff_add_member (the actor rule)", () => {
  it("adds as an active owner: one row each and one audit row with the reason", async () => {
    await add([OWNA, NEWB, "support", "{users.read,support.read}", "joining support"]);
    expect(await roleRow(NEWB)).toEqual({
      role: "support",
      scopes: ["users.read", "support.read"],
      disabled: false,
    });
    const rows = await audit(`target_user_id='${NEWB}'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "staff.add",
      actor_user_id: OWNA,
      actor_role: "owner",
      reason: "joining support",
    });
  });

  it("refuses support, a disabled owner, a non-staff account and no actor, with nothing written", async () => {
    const before = (await audit()).length;
    for (const actor of [SUP, DIS, LEARNER, null]) {
      await expect(add([actor, LEARNER, "support", "{}", "trying it on"])).rejects.toMatchObject({
        code: "42501",
      });
    }
    // a caller that LIES about its role is judged by the database, not by the argument
    await expect(
      server(() =>
        db.query("SELECT public.staff_add_member($1,'owner',$2,'support','{}','lying role')", [
          SUP,
          LEARNER,
        ]),
      ),
    ).rejects.toMatchObject({ code: "42501" });
    expect(await roleRow(LEARNER)).toBeUndefined();
    expect((await audit()).length).toBe(before);
  });

  it("refuses a reason that is too short or too long, staff.manage on support, and itself", async () => {
    const before = (await audit()).length;
    await expect(add([OWNA, LEARNER, "support", "{}", "no"])).rejects.toMatchObject({
      code: "22023",
    });
    await expect(add([OWNA, LEARNER, "support", "{}", "x".repeat(501)])).rejects.toMatchObject({
      code: "22023",
    });
    await expect(
      add([OWNA, LEARNER, "support", "{staff.manage}", "an owner-only scope"]),
    ).rejects.toThrow(/staff\.manage/);
    await expect(add([OWNA, OWNA, "owner", "{}", "promote myself"])).rejects.toThrow(/own account/);
    expect(await roleRow(LEARNER)).toBeUndefined();
    expect((await audit()).length).toBe(before);
  });

  it("an owner added by the database has no stored scopes (an owner has every scope whatever is stored)", async () => {
    await add([OWNA, LEARNER, "owner", "{users.read}", "second owner"]);
    expect((await roleRow(LEARNER))!.scopes).toEqual([]);
    // undo, so the owners below stay the ones the tests expect
    await upd([OWNA, LEARNER, "support", "{users.read}", null, "back to support"]);
  });
});

describe("staff_update_member (reason, actor rule, last owner)", () => {
  it("changes the scopes with before and after and the reason in one audit row", async () => {
    await upd([OWNA, SUP, null, "{users.read,support.read,support.reply}", null, "needs to reply"]);
    expect((await roleRow(SUP))!.scopes).toEqual(["users.read", "support.read", "support.reply"]);
    const rows = await audit(`target_user_id='${SUP}'`);
    const last = rows[rows.length - 1]!;
    expect(last).toMatchObject({ action: "staff.update", reason: "needs to reply" });
    expect(last.before).toMatchObject({ scopes: ["users.read", "support.read"] });
    expect(last.after).toMatchObject({
      scopes: ["users.read", "support.read", "support.reply"],
      disabled: false,
    });
  });

  it("disables and re-enables, each recorded", async () => {
    await upd([OWNA, NEVER, null, null, true, "left the team"]);
    expect((await roleRow(NEVER))!.disabled).toBe(true);
    await upd([OWNA, NEVER, null, null, false, "came back"]);
    expect((await roleRow(NEVER))!.disabled).toBe(false);
    const rows = await audit(`target_user_id='${NEVER}'`);
    expect(rows.map((r) => r.reason)).toEqual(["left the team", "came back"]);
  });

  it("promoting to owner clears the stored scopes; demoting keeps what the owner passes", async () => {
    await upd([OWNA, SUP, "owner", null, null, "promoted"]);
    expect(await roleRow(SUP)).toMatchObject({ role: "owner", scopes: [] });
    await upd([OWNA, SUP, "support", "{users.read,support.read}", null, "back to support"]);
    expect(await roleRow(SUP)).toMatchObject({
      role: "support",
      scopes: ["users.read", "support.read"],
    });
  });

  it("refuses without a reason, with a long one, staff.manage on support, support_ai, a stranger and yourself, writing nothing", async () => {
    const before = (await audit()).length;
    const snapshot = await roleRow(SUP);
    await expect(upd([OWNA, SUP, null, null, true, "  "])).rejects.toMatchObject({
      code: "22023",
    });
    await expect(upd([OWNA, SUP, null, null, true, "x".repeat(501)])).rejects.toMatchObject({
      code: "22023",
    });
    await expect(upd([OWNA, SUP, null, "{staff.manage}", null, "an owner scope"])).rejects.toThrow(
      /staff\.manage/,
    );
    await expect(upd([OWNA, SUP, "support_ai", null, null, "not a login"])).rejects.toThrow(
      /not a login role/,
    );
    await expect(upd([OWNA, LEARNER2(), null, null, true, "who is that"])).rejects.toMatchObject({
      code: "P0002",
    });
    await expect(upd([OWNA, OWNA, "support", null, null, "demote myself"])).rejects.toThrow(
      /own account/,
    );
    expect(await roleRow(SUP)).toEqual(snapshot);
    expect((await audit()).length).toBe(before);
  });

  it("refuses support, a disabled staff member and a non-staff account as the actor", async () => {
    const before = (await audit()).length;
    for (const actor of [SUP, DIS, LEARNER, null]) {
      await expect(upd([actor, NEVER, null, null, true, "a coup"])).rejects.toMatchObject({
        code: "42501",
      });
    }
    expect((await roleRow(NEVER))!.disabled).toBe(false);
    expect((await audit()).length).toBe(before);
  });

  it("the console is never left without an active owner: a demoted owner cannot act, nobody can demote themselves", async () => {
    // The implicit owner is retired, then the other explicit owner is demoted: OWNA is the only active owner left.
    await upd([OWNA, IMPL, null, null, true, "retiring the old owner"]);
    expect(await roleRow(IMPL)).toMatchObject({ role: "owner", disabled: true });
    await upd([OWNA, OWNB, "support", "{users.read}", null, "OWNB moves to support"]);
    const actives = async () =>
      Number(
        (
          await db.query<{ n: string }>(
            "SELECT count(*)::text n FROM public.staff_roles WHERE role='owner' AND disabled_at IS NULL",
          )
        ).rows[0]!.n,
      );
    expect(await actives()).toBe(1);
    const before = (await audit()).length;
    // the demoted owner can no longer act on the one who is left (a stale actor is judged by the database)...
    await expect(
      upd([OWNB, OWNA, "support", "{users.read}", null, "take over"]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(upd([OWNB, OWNA, null, null, true, "lock them out"])).rejects.toMatchObject({
      code: "42501",
    });
    // ...and the last owner cannot demote or disable themselves
    await expect(upd([OWNA, OWNA, "support", null, null, "demote myself"])).rejects.toThrow(
      /own account/,
    );
    await expect(upd([OWNA, OWNA, null, null, true, "disable myself"])).rejects.toThrow(
      /own account/,
    );
    expect(await roleRow(OWNA)).toMatchObject({ role: "owner", disabled: false });
    expect(await actives()).toBe(1);
    expect((await audit()).length).toBe(before);
  });

  it("is not callable by clients", async () => {
    await asRole(
      "authenticated",
      () =>
        expect(
          db.query(
            `SELECT public.staff_update_member('${OWNB}','owner','${NEVER}',NULL,NULL,true,'reason here')`,
          ),
        ).rejects.toMatchObject({ code: "42501" }),
      OWNB,
    );
  });
});

/** A random account that is not staff and has no row anywhere. */
function LEARNER2(): string {
  return id(99);
}
