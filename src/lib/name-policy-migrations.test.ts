import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DIR = path.join(process.cwd(), "supabase", "migrations");
const POLICY = "20261014100000_name_policy_self_harm_drugs_sexual_impersonation.sql";
const ADMIN_FK = "20261014100100_admin_users_added_by_set_null.sql";
const FILTER_V2 = "20261008130000_moderation_filter_v2.sql";
/** The newest migration on main when these were written; both of ours must sort after it. */
const MAIN_MAX_AT_AUTHORING = "20261013100300_private_teams_row_visibility.sql";
const read = (f: string) => fs.readFileSync(path.join(DIR, f), "utf8");

describe("pre-submission migrations: ordering", () => {
  it("sort after main's newest at authoring, in order, with unique versions", () => {
    const all = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql"));
    for (const f of [POLICY, ADMIN_FK]) {
      expect(all, f).toContain(f);
      expect(f > MAIN_MAX_AT_AUTHORING, f).toBe(true);
      expect(all.filter((x) => x.slice(0, 14) === f.slice(0, 14))).toHaveLength(1);
    }
    expect(POLICY < ADMIN_FK).toBe(true);
    const versions = all.map((f) => f.slice(0, 14));
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("depend on filter v2, which sorts before the name policy", () => {
    expect(FILTER_V2 < POLICY).toBe(true);
  });
});

describe("name policy migration: static shape", () => {
  const sql = read(POLICY);

  it("leaves contains_blocked_term alone, because the AI output check shares it", () => {
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.contains_blocked_term/);
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.blocked_moderation_terms/);
  });

  it("keeps the one error code clients already map, and no new one", () => {
    expect(sql).toContain("RETURN 'blocked-content'");
    expect(sql).not.toMatch(/RETURN '(?!blocked-content|invalid-name)[a-z-]+'/);
  });

  it("pins search_path on every function and keeps the lists service-only", () => {
    const fns = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
    expect(fns).toEqual([
      "name_policy_terms",
      "name_policy_edge_patterns",
      "name_policy_staff_terms",
      "name_policy_brand_terms",
      "name_policy_bare_brand_terms",
      "name_policy_brand_roles",
      "name_policy_blocked",
      "display_name_problem",
    ]);
    expect(sql.match(/SET search_path = ''/g)).toHaveLength(fns.length);
    for (const f of fns.filter((n) => n.startsWith("name_policy_"))) {
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`,
        ),
      );
    }
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.name_policy[^;]*TO (?!service_role;)/,
    );
  });

  it("is plain ASCII, with the bidi range written as an escape", () => {
    expect(sql).not.toMatch(/[^\x20-\x7E\n]/);
    expect(sql).toContain("\\u202A-\\u202E\\u2066-\\u2069");
  });

  it("has a rollback", () => {
    expect(sql).toMatch(/Rollback/);
    expect(sql).toMatch(/DROP FUNCTION public\.name_policy_blocked\(text\)/);
  });
});

describe("admin_users.added_by migration: static shape", () => {
  const sql = read(ADMIN_FK);
  it("re-adds the foreign key with ON DELETE SET NULL, and has a rollback", () => {
    expect(sql).toMatch(/FOREIGN KEY \(added_by\) REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
    expect(sql).toMatch(/Rollback/);
  });
});

/**
 * Runs the real SQL (filter v2, then the name policy) in an in-process Postgres. The repo has no other way to
 * execute a migration in a test, and a name filter that is only string-matched in a test is the guard that
 * cannot fail.
 */
describe("display and team name verdicts (real SQL)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec("CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;");
    await db.exec(read(FILTER_V2));
    await db.exec(read(POLICY));
  }, 120_000);
  afterAll(async () => {
    await db.close();
  });

  async function verdicts(name: string) {
    const r = await db.query<{ d: string | null; t: string | null }>(
      "SELECT public.display_name_problem($1) AS d, public.team_name_problem($1) AS t",
      [name],
    );
    return r.rows[0];
  }

  const BLOCKED = [
    // the six the audit reported
    "kill yourself",
    "KYS",
    "Admin",
    "Alphonso Support",
    "cocaine",
    "sexy",
    // self-harm
    "Kill Yourself",
    "kill urself",
    "KillYourself",
    "K1ll y0urself",
    "k.y.s",
    "kms",
    // drugs
    "Heroin",
    "Meth",
    "C0caine",
    "fentanyl",
    // sexual
    "sex",
    "S E X",
    "$ex",
    "SexyBoy",
    "Pornking",
    "nude",
    "porn",
    // staff and app impersonation
    "4dmin",
    "A.d.m.i.n",
    "Admin123",
    "Administrator",
    "Moderator Mike",
    "Mod",
    "Mod Squad",
    "Support",
    "Learner Support",
    "Staff",
    "Official",
    "AlphonsoSupport",
    "Alphonso Admin",
    "Hector Support",
    "HectorTutor",
    "Hector Tutor",
    "cocaína",
    "heroína",
    "heroina",
    "marihuana",
    "metanfetamina",
    "Pornstar",
    "Apple",
    "Apple Support",
    // blocked before this change, still blocked
    "fuck",
    "Nigger",
  ];

  const ALLOWED = [
    "Essex",
    "Sussex",
    "Middlesex",
    "Sexton",
    "Sextus",
    "Unisex",
    "Methodist",
    "heroine",
    "Heath",
    "Nudelman",
    "Admiral",
    "Modric",
    "Modesto",
    "Mohammed",
    "Staffan",
    "Supporter",
    "Hector",
    "Héctor",
    "Alphonso",
    "Siriporn",
    "Pornthip",
    "Kanokporn",
    "Pornchai",
    "Hector Garcia",
    "Alphonso Davies",
    "Apple Pie",
    "Alex",
    "Sam Smith",
    "Learner-4F2A",
    "Mariana Núñez",
    "李雷",
    "Dick Van Dyke",
    "Scunthorpe",
  ];

  it.each(BLOCKED)("blocks %s for display and team names", async (name) => {
    expect(await verdicts(name)).toEqual({ d: "blocked-content", t: "blocked-content" });
  });

  it.each(ALLOWED)("allows %s for display and team names", async (name) => {
    expect(await verdicts(name)).toEqual({ d: null, t: null });
  });

  it("still reports invalid-name for a too-short name, before any content rule", async () => {
    expect((await verdicts("a")).d).toBe("invalid-name");
  });

  it("does not change the shared matcher, so AI replies are not withheld for these words", async () => {
    const r = await db.query<{ a: boolean; b: boolean; c: boolean }>(
      "SELECT public.contains_blocked_term('sex education') AS a, public.contains_blocked_term('contact support') AS b, public.contains_blocked_term('kill yourself') AS c",
    );
    expect(r.rows[0]).toEqual({ a: false, b: false, c: false });
  });
});

describe("admin_users.added_by (real SQL)", () => {
  const A = "00000000-0000-0000-0000-000000000001";
  const B = "00000000-0000-0000-0000-000000000002";
  async function setup() {
    const db = new PGlite();
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY);
      CREATE TABLE public.admin_users (
        user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        added_at timestamptz NOT NULL DEFAULT now(),
        added_by uuid REFERENCES auth.users(id),
        note text);
      INSERT INTO auth.users VALUES ('${A}'), ('${B}');
      INSERT INTO public.admin_users (user_id) VALUES ('${A}');
      INSERT INTO public.admin_users (user_id, added_by) VALUES ('${B}', '${A}');`);
    return db;
  }

  it("fails to delete an admin who added another admin before the migration (the defect)", async () => {
    const db = await setup();
    await expect(db.exec(`DELETE FROM auth.users WHERE id = '${A}'`)).rejects.toThrow(
      /foreign key/i,
    );
    await db.close();
  }, 60_000);

  it("deletes the adder and nulls added_by after it, leaving the added admin", async () => {
    const db = await setup();
    await db.exec(read(ADMIN_FK));
    await db.exec(`DELETE FROM auth.users WHERE id = '${A}'`);
    const rows = (await db.query("SELECT user_id, added_by FROM public.admin_users")).rows;
    expect(rows).toEqual([{ user_id: B, added_by: null }]);
    await db.close();
  }, 60_000);
});
