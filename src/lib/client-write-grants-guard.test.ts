import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import {
  computeClientWriteGrants,
  findDefaultPrivilegeChanges,
  findHiddenRoleGrants,
  grantKey,
  stripSql,
} from "./client-write-grants";

const DIR = path.join(process.cwd(), "supabase/migrations");
const migrations = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => ({ version: f.split("_")[0]!, sql: readFileSync(path.join(DIR, f), "utf8") }));

const THIS_MIGRATION = "20261125100000";

/**
 * Reviewed allow-list of every INSERT / UPDATE / DELETE privilege `anon` or `authenticated` may hold on a
 * public table. Anything else fails the guard: either the migration that added it was wrong, or the entry
 * belongs here with a reason. Adding a client write privilege to a progress or reward table is never a reason.
 * Key: role.table.PRIV, with the column list in parentheses for a column-level grant.
 */
const ALLOWED: Record<string, string> = {
  "authenticated.blocked_users.INSERT": "own-row policy; the block list is the learner's own safety setting",
  "authenticated.blocked_users.DELETE": "unblock; own-row policy",
  "authenticated.device_tokens.DELETE": "sign-out removes this device's push token; own-row policy",
  "authenticated.friendships.DELETE": "unfriend and the caller-side step of account deletion; own-row policy",
  "authenticated.listen_progress.DELETE": "clear my listening history; written only by save_listen_progress, read by nothing that rewards",
  "authenticated.video_watches.DELETE": "clear my watch history; written only by a definer function, read by nothing that rewards",
  "authenticated.tutor_memory.DELETE": "forget what the tutor remembers; written only server-side",
  "authenticated.podcast_playback.INSERT": "resume position upsert from web, iOS and Android; no reward reads it",
  "authenticated.podcast_playback.UPDATE": "resume position upsert incl. completed_at; only admin_numbers_own reads it",
  "authenticated.podcast_playback.DELETE": "reset a resume position; own-row policy",
  "authenticated.profiles.UPDATE(avatar_seed,country,theme)":
    "the only profile columns clients write directly; display_name and name_confirmed_at go through confirm_display_name",
  "authenticated.content_reports.INSERT(context,kind,reason,reported,reporter)":
    "report flow; column list excludes server-set fields",
  "authenticated.nudges.INSERT(recipient_id,sender_id)": "send a nudge; limited by a trigger",
  "authenticated.nudges.UPDATE(read_at)": "mark a nudge read",
  "authenticated.streak_freeze_gifts.UPDATE(read_at)": "mark a gift read",
};

describe("client write privileges, computed from every migration", () => {
  it("matches the production snapshot of 2026-11-17 just before this migration (parser check)", () => {
    // The 13 tables production showed with table-level client writes (information_schema.role_table_grants),
    // all for authenticated; anon has none. If the parser or the default-grant model is wrong this fails.
    const before = computeClientWriteGrants(migrations, THIS_MIGRATION)
      .filter((g) => g.columns === null)
      .map(grantKey)
      .sort();
    const prod: Record<string, string> = {
      blocked_users: "DELETE,INSERT",
      device_tokens: "DELETE",
      friendships: "DELETE",
      language_progress: "DELETE",
      lesson_completions: "DELETE",
      listen_progress: "DELETE",
      podcast_play_events: "DELETE,UPDATE",
      podcast_playback: "DELETE,INSERT,UPDATE",
      profiles: "INSERT,UPDATE",
      review_items: "DELETE",
      tutor_memory: "DELETE",
      user_achievements: "DELETE",
      video_watches: "DELETE",
    };
    const expected = Object.entries(prod)
      .flatMap(([t, privs]) => privs.split(",").map((p) => `authenticated.${t}.${p}`))
      .sort();
    expect(before).toEqual(expected);
  });

  it("no client role holds a write privilege that is not on the reviewed list", () => {
    const actual = computeClientWriteGrants(migrations).map(grantKey);
    const unreviewed = actual.filter((k) => !(k in ALLOWED));
    expect(unreviewed).toEqual([]);
  });

  it("the reviewed list has no stale entries (every entry is still granted)", () => {
    const actual = new Set(computeClientWriteGrants(migrations).map(grantKey));
    expect(Object.keys(ALLOWED).filter((k) => !actual.has(k))).toEqual([]);
  });

  it("anon holds no write privilege on any table", () => {
    expect(computeClientWriteGrants(migrations).filter((g) => g.role === "anon")).toEqual([]);
  });

  it("progress and reward tables are not client-writable at all", () => {
    const writable = new Set(computeClientWriteGrants(migrations).map((g) => g.table));
    for (const t of [
      "lesson_completions",
      "language_progress",
      "review_items",
      "user_achievements",
      "user_progress",
      "activity_days",
      "podcast_play_events",
    ])
      expect(writable.has(t), t).toBe(false);
  });
});

describe("parser behaviour on small inputs", () => {
  const run = (...sqls: string[]) =>
    computeClientWriteGrants(sqls.map((sql, i) => ({ version: `2027010${i}000000`, sql }))).map(grantKey);

  it("new tables start empty after the cutoff, a comment or function body grants nothing", () => {
    expect(
      run(`CREATE TABLE public.t (id int);
           -- GRANT DELETE ON public.t TO authenticated;
           /* GRANT DELETE ON public.t TO authenticated; */
           CREATE FUNCTION f() RETURNS void LANGUAGE sql AS $$ GRANT DELETE ON public.t TO authenticated; $$;`),
    ).toEqual([]);
  });

  it("handles PUBLIC, column grants, table-level revoke removing column grants, and DROP", () => {
    expect(run(`CREATE TABLE public.t (a int, b int); GRANT UPDATE (a, b) ON public.t TO authenticated;`)).toEqual([
      "authenticated.t.UPDATE(a,b)",
    ]);
    expect(
      run(`CREATE TABLE public.t (a int); GRANT UPDATE (a) ON public.t TO authenticated; REVOKE UPDATE ON public.t FROM authenticated;`),
    ).toEqual([]);
    expect(run(`CREATE TABLE public.t (a int); GRANT INSERT ON public.t TO PUBLIC;`)).toEqual([
      "anon.t.INSERT",
      "authenticated.t.INSERT",
    ]);
    expect(run(`CREATE TABLE public.t (a int); GRANT ALL ON public.t TO authenticated; DROP TABLE public.t;`)).toEqual([]);
    expect(
      run(`CREATE TABLE public.t (a int); GRANT ALL ON public.t TO authenticated; REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM authenticated;`),
    ).toEqual(["authenticated.t.INSERT", "authenticated.t.UPDATE"]);
  });

  it("gives tables created before the 2026-10-06 cutoff the implicit platform grants", () => {
    const keys = computeClientWriteGrants([
      { version: "20260901000000", sql: "CREATE TABLE public.old (a int);" },
    ]).map(grantKey);
    expect(keys).toContain("anon.old.DELETE");
    expect(keys).toContain("authenticated.old.UPDATE");
  });
});

describe("blind spots the parser cannot model are failures, not silent passes", () => {
  const FILES = readdirSync(DIR).filter((f) => f.endsWith(".sql"));

  it("no GRANT/REVOKE naming a client role hides inside a dollar-quoted body or an EXECUTE string", () => {
    const offenders = FILES.flatMap((f) =>
      findHiddenRoleGrants(readFileSync(path.join(DIR, f), "utf8")).map((s) => `${f}: ${s}`),
    );
    expect(offenders).toEqual([]);
  });

  it("finds a hidden grant in $$, $tag$, $fn1$ bodies, nested bodies and EXECUTE strings", () => {
    const g = "GRANT DELETE ON public.t TO authenticated";
    expect(findHiddenRoleGrants(`DO $$ BEGIN ${g}; END $$;`)).toHaveLength(1);
    expect(findHiddenRoleGrants(`DO $body$ BEGIN ${g}; END $body$;`)).toHaveLength(1);
    expect(findHiddenRoleGrants(`DO $fn1$ BEGIN ${g}; END $fn1$;`)).toHaveLength(1);
    expect(findHiddenRoleGrants(`DO $a$ BEGIN EXECUTE '${g}'; END $a$;`)).toHaveLength(1);
    expect(findHiddenRoleGrants(`DO $o$ BEGIN EXECUTE $i1$ ${g} $i1$; END $o$;`).length).toBeGreaterThan(0);
    expect(findHiddenRoleGrants(`SELECT 1; EXECUTE 'REVOKE ALL ON public.t FROM public';`)).toHaveLength(1);
    expect(findHiddenRoleGrants(`DO $$ BEGIN GRANT SELECT ON public.t TO service_role; END $$;`)).toEqual([]);
    expect(findHiddenRoleGrants(`-- ${g};\n/* ${g}; */ SELECT 1;`)).toEqual([]);
  });

  it("strips dollar quotes with any tag, digits included, so a body never counts as a statement", () => {
    expect(stripSql("a $fn1$ GRANT x $fn1$ b")).not.toMatch(/GRANT/);
    expect(stripSql("a $$ GRANT x $$ b")).not.toMatch(/GRANT/);
    expect(stripSql("a $tag_2$ GRANT x $tag_2$ b")).not.toMatch(/GRANT/);
  });

  // The existing, reviewed ALTER DEFAULT PRIVILEGES statements that name client roles. A new one fails.
  const DEFAULT_PRIVS_ALLOWED: Record<string, string> = {
    "20261006120000_tighten_default_table_privileges.sql":
      "revokes the default table privileges from anon and authenticated (the reason new tables start empty)",
    "20261105100000_function_default_privileges.sql":
      "revokes the default function and sequence privileges from public, anon and authenticated",
  };

  it("no migration changes default privileges for a client role except the reviewed ones", () => {
    const offenders = FILES.filter((f) => !(f in DEFAULT_PRIVS_ALLOWED)).flatMap((f) =>
      findDefaultPrivilegeChanges(readFileSync(path.join(DIR, f), "utf8")).map((s) => `${f}: ${s}`),
    );
    expect(offenders).toEqual([]);
  });

  it("the reviewed default-privilege files still contain such a statement (no stale entries)", () => {
    for (const f of Object.keys(DEFAULT_PRIVS_ALLOWED))
      expect(findDefaultPrivilegeChanges(readFileSync(path.join(DIR, f), "utf8")).length, f).toBeGreaterThan(0);
  });

  it("detects ALTER DEFAULT PRIVILEGES naming client roles, and ignores other roles and comments", () => {
    expect(
      findDefaultPrivilegeChanges("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;"),
    ).toHaveLength(1);
    expect(
      findDefaultPrivilegeChanges("ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;"),
    ).toHaveLength(1);
    expect(
      findDefaultPrivilegeChanges("DO $x1$ BEGIN ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon; END $x1$;"),
    ).toHaveLength(1);
    expect(
      findDefaultPrivilegeChanges("ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO service_role;"),
    ).toEqual([]);
    expect(
      findDefaultPrivilegeChanges("-- ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon;\nSELECT 1;"),
    ).toEqual([]);
  });

  it("REVOKE GRANT OPTION FOR does not remove the privilege itself", () => {
    const run = (...sqls: string[]) =>
      computeClientWriteGrants(sqls.map((sql, i) => ({ version: `2027010${i}000000`, sql }))).map(grantKey);
    expect(
      run(`CREATE TABLE public.t (a int); GRANT DELETE ON public.t TO authenticated;
           REVOKE GRANT OPTION FOR DELETE ON public.t FROM authenticated;`),
    ).toEqual(["authenticated.t.DELETE"]);
    expect(
      run(`CREATE TABLE public.t (a int); GRANT DELETE ON public.t TO authenticated;
           REVOKE DELETE ON public.t FROM authenticated;`),
    ).toEqual([]);
  });
});

describe("the migration's profiles column grant, executed in Postgres",{ timeout: 60_000 }, () => {
  async function db() {
    const d = new PGlite();
    await d.exec(`
      CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, display_name text NOT NULL, country text, avatar_seed text,
        theme text, name_confirmed_at timestamptz, ai_consent_at timestamptz);
      GRANT SELECT ON public.profiles TO authenticated;
      GRANT INSERT, UPDATE ON public.profiles TO authenticated;
      CREATE TABLE public.lesson_completions (id int PRIMARY KEY, user_id uuid);
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_completions TO authenticated;
      CREATE TABLE public.podcast_play_events (id int PRIMARY KEY, user_id uuid);
      GRANT SELECT, UPDATE, DELETE ON public.podcast_play_events TO authenticated;
      CREATE TABLE public.language_progress (id int PRIMARY KEY); GRANT DELETE ON public.language_progress TO authenticated;
      CREATE TABLE public.review_items (id int PRIMARY KEY); GRANT DELETE ON public.review_items TO authenticated;
      CREATE TABLE public.user_achievements (id int PRIMARY KEY); GRANT DELETE ON public.user_achievements TO authenticated;
      INSERT INTO public.profiles (id, display_name) VALUES ('00000000-0000-4000-8000-000000000001', 'Ana');
      INSERT INTO public.lesson_completions VALUES (1, '00000000-0000-4000-8000-000000000001');
    `);
    await d.exec(
      readFileSync(path.join(DIR, `${THIS_MIGRATION}_client_write_privileges.sql`), "utf8"),
    );
    return d;
  }
  const as = async (d: PGlite, sql: string) => {
    await d.exec("SET ROLE authenticated");
    try {
      await d.exec(sql);
      return "ok";
    } catch (e) {
      return (e as Error).message;
    } finally {
      await d.exec("RESET ROLE");
    }
  };

  it("lets a client change avatar_seed, theme and country but not name_confirmed_at or display_name", async () => {
    const d = await db();
    expect(await as(d, "UPDATE public.profiles SET avatar_seed='x', theme='royal', country='NL'")).toBe("ok");
    expect(await as(d, "UPDATE public.profiles SET name_confirmed_at = now()")).toMatch(/permission denied/);
    expect(await as(d, "UPDATE public.profiles SET display_name = 'Zed'")).toMatch(/permission denied/);
    expect(await as(d, "UPDATE public.profiles SET ai_consent_at = now()")).toMatch(/permission denied/);
    expect(await as(d, "INSERT INTO public.profiles (id, display_name) VALUES (gen_random_uuid(), 'X')")).toMatch(
      /permission denied/,
    );
  });

  it("stops a client deleting progress rows and updating play events", async () => {
    const d = await db();
    for (const t of ["lesson_completions", "language_progress", "review_items", "user_achievements"])
      expect(await as(d, `DELETE FROM public.${t}`), t).toMatch(/permission denied/);
    expect(await as(d, "UPDATE public.podcast_play_events SET user_id = NULL")).toMatch(/permission denied/);
    expect(await as(d, "DELETE FROM public.podcast_play_events")).toMatch(/permission denied/);
    expect(await as(d, "SELECT * FROM public.lesson_completions")).toBe("ok");
  });
});
