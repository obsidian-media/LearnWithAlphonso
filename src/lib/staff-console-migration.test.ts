import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Staff console tables and functions (20261113100000), EXECUTED in a real Postgres (PGlite) as seeded users.
 */
const FILE = "20261113100000_staff_console.sql";
const sqlText = readFileSync(path.join(process.cwd(), "supabase/migrations", FILE), "utf8");
const ACTOR = "00000000-0000-4000-8000-0000000000a1";
const T1 = "00000000-0000-4000-8000-000000000001";
const T2 = "00000000-0000-4000-8000-000000000002";
const T3 = "00000000-0000-4000-8000-000000000003";
const S1 = "00000000-0000-4000-8000-0000000000b1";
const S2 = "00000000-0000-4000-8000-0000000000b2";

const TABLES = [
  "staff_roles",
  "staff_audit_log",
  "user_restrictions",
  "pro_grants",
  "staff_notes",
] as const;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticated; CREATE ROLE anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE TABLE auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE);
    CREATE TABLE auth.refresh_tokens (id bigserial PRIMARY KEY, user_id varchar(255), session_id uuid);
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT NULLIF(current_setting('app.uid', true), '')::uuid $$;
    ALTER TABLE auth.users ADD COLUMN email text, ADD COLUMN created_at timestamptz DEFAULT now();
    CREATE TABLE public.admin_users (user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, added_at timestamptz NOT NULL DEFAULT now(), added_by uuid, note text);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, display_name text);
    INSERT INTO auth.users(id) VALUES ('${ACTOR}'), ('${T1}'), ('${T2}'), ('${T3}'), ('${S1}'), ('${S2}');
    UPDATE auth.users SET email = 'learner1@example.com' WHERE id = '${T1}';
    UPDATE auth.users SET email = 'Other.Person@example.com' WHERE id = '${T2}';
    INSERT INTO public.profiles VALUES ('${T1}', 'Maria Lopez'), ('${T2}', '100%_Real'), ('${S2}', 'Marcus');
    GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
  `);
  await db.exec(sqlText);
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
const asServer = <T>(fn: () => Promise<T>) => asRole("service_role", fn);
const count = async (table: string, where = "true") =>
  Number(
    (await db.query<{ n: string }>(`SELECT count(*)::text n FROM public.${table} WHERE ${where}`))
      .rows[0]!.n,
  );

describe("staff console migration", () => {
  it("applies cleanly after all migrations (all five tables exist)", async () => {
    for (const t of TABLES) expect(await count(t)).toBe(0);
  });

  it("audit log refuses UPDATE and DELETE even for service_role", async () => {
    await asServer(() =>
      db.query(
        "SELECT public.staff_record($1,'owner','test.seed',$2,'seed reason',null,null,null)",
        [ACTOR, T1],
      ),
    );
    // The trigger itself, reached as the table owner (privileges alone would stop service_role first).
    await expect(db.query("UPDATE public.staff_audit_log SET reason = 'x'")).rejects.toThrow(
      /append-only/,
    );
    await expect(db.query("DELETE FROM public.staff_audit_log")).rejects.toThrow(/append-only/);
    await expect(db.query("TRUNCATE public.staff_audit_log")).rejects.toThrow(/append-only/);
    // And the grants: service_role cannot even attempt it.
    await asServer(() =>
      expect(db.query("UPDATE public.staff_audit_log SET reason = 'x'")).rejects.toMatchObject({
        code: "42501",
      }),
    );
    await asServer(() =>
      expect(db.query("DELETE FROM public.staff_audit_log")).rejects.toMatchObject({
        code: "42501",
      }),
    );
    expect(await count("staff_audit_log", "action = 'test.seed'")).toBe(1);
  });

  it("anon and authenticated cannot select any of the five tables", async () => {
    for (const role of ["anon", "authenticated"]) {
      for (const t of TABLES) {
        await asRole(
          role,
          () =>
            expect(db.query(`SELECT * FROM public.${t}`)).rejects.toMatchObject({ code: "42501" }),
          ACTOR,
        );
      }
    }
  });

  it("staff_set_restriction writes the restriction and exactly one audit row", async () => {
    const before = await count("staff_audit_log");
    const { rows } = await asServer(() =>
      db.query<{ id: string }>(
        "SELECT public.staff_set_restriction($1,'support',$2,'block','harassing others') AS id",
        [ACTOR, T2],
      ),
    );
    expect(rows[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await count("user_restrictions", `user_id='${T2}' AND kind='block'`)).toBe(1);
    expect(await count("staff_audit_log")).toBe(before + 1);
    const audit = (
      await db.query<{ action: string; reason: string; actor_role: string }>(
        `SELECT action, reason, actor_role FROM public.staff_audit_log WHERE target_user_id='${T2}'`,
      )
    ).rows;
    expect(audit).toEqual([
      { action: "user.block", reason: "harassing others", actor_role: "support" },
    ]);
  });

  it("if staff_record raises (p_action null) no restriction row exists", async () => {
    // staff_record rejects a null action; the restriction function passes whatever kind maps to, so test the pair
    // directly: the writer inside one transaction with a failing audit leaves nothing behind.
    await expect(
      asServer(() =>
        db.query(
          `DO $$ BEGIN
             INSERT INTO public.user_restrictions(user_id, kind, reason) VALUES ('${T3}','ban','x');
             PERFORM public.staff_record('${ACTOR}','owner',NULL,'${T3}','r',NULL,NULL,NULL);
           END $$`,
        ),
      ),
    ).rejects.toThrow();
    expect(await count("user_restrictions", `user_id='${T3}'`)).toBe(0);
    // And through the real function: a bad kind is refused with no row and no audit row.
    const audits = await count("staff_audit_log");
    await asServer(() =>
      expect(
        db.query("SELECT public.staff_set_restriction($1,'owner',$2,'nonsense','r')", [ACTOR, T3]),
      ).rejects.toThrow(),
    );
    expect(await count("user_restrictions", `user_id='${T3}'`)).toBe(0);
    expect(await count("staff_audit_log")).toBe(audits);
  });

  it("staff_set_restriction refuses acting on yourself and a double restriction", async () => {
    await asServer(() =>
      expect(
        db.query("SELECT public.staff_set_restriction($1,'owner',$1,'block','r')", [ACTOR]),
      ).rejects.toThrow(/own account/),
    );
    await asServer(() =>
      expect(
        db.query("SELECT public.staff_set_restriction($1,'owner',$2,'block','again')", [ACTOR, T2]),
      ).rejects.toMatchObject({ code: "23505" }),
    );
  });

  it("is_restricted is true only for an active (not lifted) row of that kind", async () => {
    const check = (u: string, k: string) =>
      asServer(
        async () =>
          (await db.query<{ r: boolean }>("SELECT public.is_restricted($1,$2) AS r", [u, k]))
            .rows[0]!.r,
      );
    expect(await check(T2, "block")).toBe(true);
    expect(await check(T2, "ban")).toBe(false);
    expect(await check(T1, "block")).toBe(false);
    await asServer(() =>
      db.query("SELECT public.staff_lift_restriction($1,'owner',$2,'block','resolved')", [
        ACTOR,
        T2,
      ]),
    );
    expect(await check(T2, "block")).toBe(false);
    // A lifted row stays on record, and the lift is audited.
    expect(await count("user_restrictions", `user_id='${T2}' AND lifted_at IS NOT NULL`)).toBe(1);
    expect(await count("staff_audit_log", `action='user.unblock' AND target_user_id='${T2}'`)).toBe(
      1,
    );
    // Authenticated may call it (RLS and RPCs use it); anon may not.
    await asRole("authenticated", async () => {
      const r = await db.query<{ r: boolean }>("SELECT public.is_restricted($1,'block') AS r", [
        T2,
      ]);
      expect(r.rows[0]!.r).toBe(false);
    });
    await asRole("anon", () =>
      expect(db.query("SELECT public.is_restricted($1,'block')", [T2])).rejects.toMatchObject({
        code: "42501",
      }),
    );
  });

  it("clients cannot call the write functions", async () => {
    for (const q of [
      `SELECT public.staff_record('${ACTOR}','owner','a','${T1}','r',null,null,null)`,
      `SELECT public.staff_set_restriction('${ACTOR}','owner','${T1}','block','r')`,
      `SELECT public.staff_lift_restriction('${ACTOR}','owner','${T1}','block','r')`,
      `SELECT public.staff_revoke_sessions('${T1}')`,
    ]) {
      await asRole(
        "authenticated",
        () => expect(db.query(q)).rejects.toMatchObject({ code: "42501" }),
        ACTOR,
      );
    }
  });

  it("deleting the target auth user keeps its audit rows", async () => {
    await asServer(() =>
      db.query("SELECT public.staff_set_restriction($1,'owner',$2,'ban','abuse')", [ACTOR, T3]),
    );
    expect(await count("staff_audit_log", `target_user_id='${T3}'`)).toBe(1);
    await db.exec(`DELETE FROM auth.users WHERE id='${T3}'`);
    expect(await count("staff_audit_log", `target_user_id='${T3}'`)).toBe(1);
    expect(await count("user_restrictions", `user_id='${T3}'`)).toBe(0);
    // A staff member's own audit rows survive their removal too.
    await asServer(() =>
      db.query("SELECT public.staff_record($1,'support','test.x',$2,'r',null,null,null)", [S1, T1]),
    );
    await db.exec(`DELETE FROM auth.users WHERE id='${S1}'`);
    expect(await count("staff_audit_log", `actor_user_id='${S1}'`)).toBe(1);
  });

  it("staff_revoke_sessions removes the target's sessions and refresh tokens only", async () => {
    const SA = "10000000-0000-4000-8000-000000000001";
    const SB = "10000000-0000-4000-8000-000000000002";
    await db.exec(`
      INSERT INTO auth.sessions VALUES ('${SA}','${T1}'), ('${SB}','${S2}');
      INSERT INTO auth.refresh_tokens(user_id, session_id) VALUES ('${T1}','${SA}'), ('${S2}','${SB}');
    `);
    await asServer(() => db.query("SELECT public.staff_revoke_sessions($1)", [T1]));
    const s = await db.query<{ user_id: string }>("SELECT user_id FROM auth.sessions");
    expect(s.rows.map((r) => r.user_id)).toEqual([S2]);
    const t = await db.query<{ user_id: string }>("SELECT user_id FROM auth.refresh_tokens");
    expect(t.rows.map((r) => r.user_id)).toEqual([S2]);
  });

  it("role and scope constraints hold", async () => {
    await expect(
      db.query(
        `INSERT INTO public.staff_roles(user_id, role, scopes) VALUES ('${S2}','janitor','{}')`,
      ),
    ).rejects.toThrow();
    await db.exec(
      `INSERT INTO public.staff_roles(user_id, role, scopes) VALUES ('${S2}','support','{users.read}')`,
    );
    await expect(
      db.query(
        `INSERT INTO public.staff_notes(user_id, author_id, body) VALUES ('${T1}','${S2}','')`,
      ),
    ).rejects.toThrow();
  });

  it("staff_search_users finds by exact email, id and name prefix, and is bounded", async () => {
    const search = (q: string) =>
      asServer(async () =>
        (
          await db.query<{ id: string }>("SELECT id FROM public.staff_search_users($1)", [q])
        ).rows.map((r) => r.id),
      );
    expect(await search("LEARNER1@example.com")).toEqual([T1]);
    expect(await search("learner1@example")).toEqual([]); // email is exact, never a prefix
    expect(await search(T2)).toEqual([T2]);
    expect(await search("mar")).toEqual(expect.arrayContaining([T1, S2]));
    expect(await search("mar")).toHaveLength(2);
    expect(await search("100%")).toEqual([T2]); // wildcards are literal
    expect(await search("%%")).toEqual([]);
    await asServer(() =>
      expect(db.query("SELECT * FROM public.staff_search_users('m')")).rejects.toMatchObject({
        code: "22023",
      }),
    );
    await asRole(
      "authenticated",
      () =>
        expect(db.query("SELECT * FROM public.staff_search_users('mar')")).rejects.toMatchObject({
          code: "42501",
        }),
      ACTOR,
    );
  });

  it("staff_add_note writes the note and one audit row together, and refuses bad input", async () => {
    const before = await count("staff_audit_log");
    await asServer(() =>
      db.query("SELECT public.staff_add_note($1,'support',$2,'asked about billing')", [ACTOR, T1]),
    );
    expect(await count("staff_notes", `user_id='${T1}' AND author_id='${ACTOR}'`)).toBe(1);
    expect(await count("staff_audit_log")).toBe(before + 1);
    expect(await count("staff_audit_log", `action='note.add' AND target_user_id='${T1}'`)).toBe(1);
    // the note text is not copied into the record's before/after
    expect(
      await count("staff_audit_log", `action='note.add' AND after::text LIKE '%billing%'`),
    ).toBe(0);
    for (const args of [
      [ACTOR, T1, ""],
      [ACTOR, T1, "x".repeat(2001)],
      [ACTOR, ACTOR, "self"],
    ]) {
      await asServer(() =>
        expect(
          db.query("SELECT public.staff_add_note($1,'support',$2,$3)", args),
        ).rejects.toThrow(),
      );
    }
    expect(await count("staff_notes", `user_id='${T1}'`)).toBe(1);
    expect(await count("staff_audit_log")).toBe(before + 1);
  });

  it("staff_record_pro_grant and staff_record_pro_revoke record the gift and its end", async () => {
    await asServer(() =>
      db.query(
        "SELECT public.staff_record_pro_grant($1,'owner',$2,now() + interval '30 days','support goodwill','{\"pro\":false}'::jsonb)",
        [ACTOR, T1],
      ),
    );
    expect(await count("pro_grants", `user_id='${T1}' AND revoked_at IS NULL`)).toBe(1);
    expect(await count("staff_audit_log", `action='pro.grant' AND target_user_id='${T1}'`)).toBe(1);
    await asServer(() =>
      expect(
        db.query(
          "SELECT public.staff_record_pro_grant($1,'owner',$2,now() - interval '1 day','r',null)",
          [ACTOR, T1],
        ),
      ).rejects.toThrow(),
    );
    await asServer(() =>
      expect(
        db.query(
          "SELECT public.staff_record_pro_grant($1,'owner',$1,now() + interval '1 day','r',null)",
          [ACTOR],
        ),
      ).rejects.toThrow(/own account/),
    );
    await asServer(() =>
      db.query("SELECT public.staff_record_pro_revoke($1,'owner',$2,'given by mistake',null)", [
        ACTOR,
        T1,
      ]),
    );
    expect(await count("pro_grants", `user_id='${T1}' AND revoked_at IS NOT NULL`)).toBe(1);
    expect(await count("staff_audit_log", `action='pro.revoke' AND target_user_id='${T1}'`)).toBe(
      1,
    );
  });

  it("staff_add_member writes admin_users, staff_roles and one audit row together", async () => {
    const before = await count("staff_audit_log");
    await asServer(() =>
      db.query(
        "SELECT public.staff_add_member($1,'owner',$2,'support','{users.read,users.notes}','new support hire')",
        [ACTOR, T1],
      ),
    );
    expect(await count("admin_users", `user_id='${T1}'`)).toBe(1);
    expect(
      await count("staff_roles", `user_id='${T1}' AND role='support' AND added_by='${ACTOR}'`),
    ).toBe(1);
    expect(await count("staff_audit_log")).toBe(before + 1);
    expect(await count("staff_audit_log", `action='staff.add' AND target_user_id='${T1}'`)).toBe(1);
  });

  it("staff_add_member refuses support_ai, yourself, an existing member and a support with staff.manage", async () => {
    const before = await count("staff_audit_log");
    const add = (args: unknown[]) =>
      asServer(() =>
        db.query("SELECT public.staff_add_member($1,'owner',$2,$3,$4::text[],'reason here')", args),
      );
    await expect(add([ACTOR, T2, "support_ai", "{}"])).rejects.toThrow(/not a login role/);
    await expect(add([ACTOR, ACTOR, "support", "{}"])).rejects.toThrow(/own account/);
    await expect(add([ACTOR, T1, "support", "{}"])).rejects.toMatchObject({ code: "23505" });
    await expect(add([ACTOR, T2, "support", "{staff.manage}"])).rejects.toThrow(/staff\.manage/);
    expect(await count("admin_users", `user_id='${T2}'`)).toBe(0);
    expect(await count("staff_audit_log")).toBe(before);
  });

  it("staff_update_member changes role, scopes and disabled with before and after, and refuses the bad cases", async () => {
    await asServer(() =>
      db.query(
        "SELECT public.staff_update_member($1,'owner',$2,NULL,'{users.read}',true,'left the team')",
        [ACTOR, T1],
      ),
    );
    const row = (
      await db.query<{ scopes: string[]; disabled: boolean }>(
        `SELECT scopes, disabled_at IS NOT NULL AS disabled FROM public.staff_roles WHERE user_id='${T1}'`,
      )
    ).rows[0]!;
    expect(row).toEqual({ scopes: ["users.read"], disabled: true });
    const audit = (
      await db.query<{ before: { disabled: boolean }; after: { disabled: boolean } }>(
        `SELECT before, after FROM public.staff_audit_log WHERE action='staff.update' AND target_user_id='${T1}'`,
      )
    ).rows[0]!;
    expect(audit.before.disabled).toBe(false);
    expect(audit.after.disabled).toBe(true);
    const upd = (args: unknown[]) =>
      asServer(() =>
        db.query(
          "SELECT public.staff_update_member($1,'owner',$2,$3,$4::text[],$5,'reason here')",
          args,
        ),
      );
    await expect(upd([ACTOR, ACTOR, null, null, true])).rejects.toThrow(/own account/);
    await expect(upd([ACTOR, T1, null, "{staff.manage}", null])).rejects.toThrow(/staff\.manage/);
    await expect(upd([ACTOR, T1, "support_ai", null, null])).rejects.toThrow(/not a login role/);
    await expect(upd([ACTOR, T3, "support", null, null])).rejects.toMatchObject({ code: "P0002" });
  });

  it("staff_add_member and staff_update_member are not callable by clients", async () => {
    for (const q of [
      `SELECT public.staff_add_member('${ACTOR}','owner','${T2}','support','{}','reason here')`,
      `SELECT public.staff_update_member('${ACTOR}','owner','${T1}',NULL,NULL,true,'reason here')`,
    ]) {
      await asRole(
        "authenticated",
        () => expect(db.query(q)).rejects.toMatchObject({ code: "42501" }),
        ACTOR,
      );
    }
  });
  describe("restricting staff", () => {
    const OWNR = "00000000-0000-4000-8000-0000000000c1";
    const SUPP = "00000000-0000-4000-8000-0000000000c2";
    const IMPL = "00000000-0000-4000-8000-0000000000c3";
    const rowCounts = async (u: string) => ({
      restrictions: await count("user_restrictions", `user_id='${u}'`),
      audit: await count("staff_audit_log", `target_user_id='${u}'`),
    });
    const run = (q: string, args: unknown[]) => asServer(() => db.query(q, args));

    beforeAll(async () => {
      await db.exec(`
        INSERT INTO auth.users(id) VALUES ('${OWNR}'), ('${SUPP}'), ('${IMPL}');
        INSERT INTO public.admin_users(user_id) VALUES ('${OWNR}'), ('${SUPP}'), ('${IMPL}');
        INSERT INTO public.staff_roles(user_id, role, scopes) VALUES ('${OWNR}','owner','{}'), ('${SUPP}','support','{user.block}');
      `);
    });

    it("support cannot block or ban an owner, explicit or implicit: refused, no restriction row, no audit row", async () => {
      for (const target of [OWNR, IMPL]) {
        for (const kind of ["block", "ban"]) {
          const before = await rowCounts(target);
          await asServer(() =>
            expect(
              db.query("SELECT public.staff_set_restriction($1,'support',$2,$3,'because I can')", [
                ACTOR,
                target,
                kind,
              ]),
            ).rejects.toMatchObject({ code: "42501" }),
          );
          expect(await rowCounts(target)).toEqual(before);
        }
      }
    });

    it("support cannot restrict another staff member, but an owner can; nobody can restrict an owner", async () => {
      const before = await rowCounts(SUPP);
      await asServer(() =>
        expect(
          db.query("SELECT public.staff_set_restriction($1,'support',$2,'block','no way')", [
            ACTOR,
            SUPP,
          ]),
        ).rejects.toMatchObject({ code: "42501" }),
      );
      expect(await rowCounts(SUPP)).toEqual(before);
      // an owner may restrict support staff
      await run(
        "SELECT public.staff_set_restriction($1,'owner',$2,'block','misuse of the console')",
        [ACTOR, SUPP],
      );
      expect((await rowCounts(SUPP)).restrictions).toBe(1);
      // lifting is held to the same rule
      await asServer(() =>
        expect(
          db.query("SELECT public.staff_lift_restriction($1,'support',$2,'block','undo it')", [
            ACTOR,
            SUPP,
          ]),
        ).rejects.toMatchObject({ code: "42501" }),
      );
      expect((await rowCounts(SUPP)).restrictions).toBe(1);
      await run("SELECT public.staff_lift_restriction($1,'owner',$2,'block','resolved')", [
        ACTOR,
        SUPP,
      ]);
      // even an owner cannot restrict an owner
      const owner = await rowCounts(OWNR);
      await asServer(() =>
        expect(
          db.query("SELECT public.staff_set_restriction($1,'owner',$2,'ban','coup')", [
            ACTOR,
            OWNR,
          ]),
        ).rejects.toMatchObject({ code: "42501" }),
      );
      expect(await rowCounts(OWNR)).toEqual(owner);
    });
  });

  it("staff_search_users treats backslash, percent and underscore in the query as literal text", async () => {
    const U = "00000000-0000-4000-8000-0000000000c4";
    await db.exec(`
      INSERT INTO auth.users(id) VALUES ('${U}');
      INSERT INTO public.profiles VALUES ('${U}', '50%\\off_deal');
    `);
    const search = (q: string) =>
      asServer(async () =>
        (
          await db.query<{ id: string }>("SELECT id FROM public.staff_search_users($1)", [q])
        ).rows.map((r) => r.id),
      );
    expect(await search("50%\\o")).toEqual([U]);
    expect(await search("50%\\off_d")).toEqual([U]);
    expect(await search("50%off")).toEqual([]); // the backslash is not an escape character
    expect(await search("50_\\")).toEqual([]);
  });

  describe("report actions", () => {
    const REP = "00000000-0000-4000-8000-0000000000d1";
    const TEAM = "00000000-0000-4000-8000-0000000000e1";
    const GONE = "00000000-0000-4000-8000-0000000000e9";
    const audit = (action: string) =>
      count("staff_audit_log", `action='${action}' AND actor_user_id='${ACTOR}'`);

    beforeAll(async () => {
      await db.exec(`
        CREATE TABLE public.teams (id uuid PRIMARY KEY, name text);
        CREATE TABLE public.content_reports (id uuid PRIMARY KEY, reported uuid);
        CREATE FUNCTION public.admin_reset_display_name(_user_id uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'Learner-ABCD' $$;
        CREATE FUNCTION public.admin_rename_team(_team_id uuid, _name text) RETURNS text LANGUAGE plpgsql AS $$
          BEGIN IF _name = 'bad' THEN RETURN 'blocked-content'; END IF; UPDATE public.teams SET name = _name WHERE id = _team_id; RETURN NULL; END $$;
        INSERT INTO public.teams VALUES ('${TEAM}', 'Old name');
        INSERT INTO public.content_reports VALUES ('${REP}', '${T1}');
      `);
    });

    it("a refused rename (blocked name) or a team that is gone writes no audit row", async () => {
      const r = await asServer(() =>
        db.query<{ r: string }>(
          "SELECT public.staff_rename_team($1,'support',$2,$3,$4,'bad') AS r",
          [ACTOR, T1, REP, TEAM],
        ),
      );
      expect(r.rows[0]!.r).toBe("blocked-content");
      expect(await audit("report.rename_team")).toBe(0);
      const gone = await asServer(() =>
        db.query<{ r: boolean }>("SELECT public.staff_disband_team($1,'support',$2,$3,$4) AS r", [
          ACTOR,
          T1,
          REP,
          GONE,
        ]),
      );
      expect(gone.rows[0]!.r).toBe(false);
      expect(await audit("report.disband_team")).toBe(0);
    });

    it("every report action writes its audit row in the same call as the change", async () => {
      await asServer(async () => {
        await db.query("SELECT public.staff_reset_display_name($1,'support',$2,$3)", [
          ACTOR,
          T1,
          REP,
        ]);
        await db.query("SELECT public.staff_rename_team($1,'support',$2,$3,$4,'New name')", [
          ACTOR,
          T1,
          REP,
          TEAM,
        ]);
        await db.query("SELECT public.staff_disband_team($1,'support',$2,$3,$4)", [
          ACTOR,
          T1,
          REP,
          TEAM,
        ]);
        await db.query("SELECT public.staff_dismiss_report($1,'support',$2,$3)", [ACTOR, T1, REP]);
      });
      for (const a of [
        "report.reset_display_name",
        "report.rename_team",
        "report.disband_team",
        "report.dismiss",
      ]) {
        expect(await audit(a), a).toBe(1);
      }
      expect(await count("teams")).toBe(0);
      expect(await count("content_reports")).toBe(0);
    });

    it("clients cannot call the report functions", async () => {
      await asRole(
        "authenticated",
        () =>
          expect(
            db.query("SELECT public.staff_dismiss_report($1,'support',$2,$3)", [ACTOR, T1, REP]),
          ).rejects.toMatchObject({ code: "42501" }),
        ACTOR,
      );
    });
  });
});
