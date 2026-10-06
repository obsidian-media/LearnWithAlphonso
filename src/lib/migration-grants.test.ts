import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkNewTableGrants } from "./migration-grants";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");
/** The migration that made new tables start closed; only migrations AFTER it are held to the rule. */
const CUTOFF = "20261006120000";

describe("checkNewTableGrants (the checker itself)", () => {
  it("accepts a table that grants SELECT to authenticated", () => {
    const sql = `CREATE TABLE public.a (id int);
      GRANT SELECT ON public.a TO authenticated;`;
    expect(checkNewTableGrants(sql)).toEqual([]);
  });

  it("accepts the TABLE keyword, several privileges and several grantees", () => {
    const sql = `CREATE TABLE IF NOT EXISTS public.a (id int);
      GRANT SELECT, INSERT ON TABLE public.a TO authenticated, service_role;`;
    expect(checkNewTableGrants(sql)).toEqual([]);
  });

  it("accepts a grant to anon only (a public read-only table)", () => {
    expect(
      checkNewTableGrants("CREATE TABLE public.a (id int); GRANT SELECT ON public.a TO anon;"),
    ).toEqual([]);
  });

  it("rejects a table with no grant and no marker", () => {
    const v = checkNewTableGrants("CREATE TABLE public.a (id int);");
    expect(v).toHaveLength(1);
    expect(v[0].table).toBe("a");
  });

  it("accepts a service-role-only table that carries the marker", () => {
    const sql = `-- client-grants: none public.a
      CREATE TABLE public.a (id int);
      GRANT ALL ON public.a TO service_role;`;
    expect(checkNewTableGrants(sql)).toEqual([]);
  });

  it("a grant to service_role alone is NOT a client grant", () => {
    const v = checkNewTableGrants(
      "CREATE TABLE public.a (id int); GRANT ALL ON public.a TO service_role;",
    );
    expect(v.map((x) => x.table)).toEqual(["a"]);
  });

  it("a grant on a DIFFERENT table does not count", () => {
    const sql = `CREATE TABLE public.a (id int); CREATE TABLE public.b (id int);
      GRANT SELECT ON public.b TO authenticated;`;
    expect(checkNewTableGrants(sql).map((x) => x.table)).toEqual(["a"]);
  });

  it("a grant or marker inside a comment does not count", () => {
    const sql = `CREATE TABLE public.a (id int);
      -- GRANT SELECT ON public.a TO authenticated;`;
    expect(checkNewTableGrants(sql)).toHaveLength(1);
  });

  it("rejects a client-facing policy without a grant, even with the marker", () => {
    const sql = `-- client-grants: none public.a
      CREATE TABLE public.a (id int);
      CREATE POLICY a_own ON public.a FOR SELECT TO authenticated USING (true);`;
    const v = checkNewTableGrants(sql);
    expect(v).toHaveLength(1);
    expect(v[0].problem).toMatch(/policy/);
  });

  it("treats a policy with no TO clause as client-facing (it defaults to PUBLIC)", () => {
    const sql = `-- client-grants: none public.a
      CREATE TABLE public.a (id int);
      CREATE POLICY a_all ON public.a FOR SELECT USING (true);`;
    expect(checkNewTableGrants(sql)).toHaveLength(1);
  });

  it("a policy only for service_role is not client-facing", () => {
    const sql = `-- client-grants: none public.a
      CREATE TABLE public.a (id int);
      CREATE POLICY a_svc ON public.a FOR ALL TO service_role USING (true);`;
    expect(checkNewTableGrants(sql)).toEqual([]);
  });

  it("is case-insensitive and ignores non-public schemas", () => {
    expect(
      checkNewTableGrants(
        "create table public.A (id int); grant select on public.a to authenticated;",
      ),
    ).toEqual([]);
    expect(checkNewTableGrants("CREATE TABLE auth.thing (id int);")).toEqual([]);
  });
});

describe("checkNewTableGrants: spellings seen in real migrations", () => {
  const bad = (sql: string) => checkNewTableGrants(sql).map((v) => v.table);

  it("does not count a GRANT inside a block comment", () => {
    expect(
      bad("CREATE TABLE public.a (id int); /* GRANT SELECT ON public.a TO authenticated; */"),
    ).toEqual(["a"]);
  });

  it("a block comment in front of a real GRANT does not hide it", () => {
    expect(
      bad(
        "CREATE TABLE public.a (id int); /* readable by users */ GRANT SELECT ON public.a TO authenticated;",
      ),
    ).toEqual([]);
  });

  it("sees quoted, schema-less and UNLOGGED table creation", () => {
    expect(bad('CREATE TABLE "public"."a" (id int);')).toEqual(["a"]);
    expect(bad('CREATE TABLE public."a" (id int);')).toEqual(["a"]);
    expect(bad("CREATE TABLE a (id int);")).toEqual(["a"]);
    expect(bad("CREATE UNLOGGED TABLE public.a (id int);")).toEqual(["a"]);
  });

  it("ignores tables in other schemas", () => {
    expect(bad("CREATE TABLE private.a (id int);")).toEqual([]);
  });

  it("accepts a grant in every quoting and qualification", () => {
    expect(
      bad('CREATE TABLE "public"."a" (id int); GRANT SELECT ON "public"."a" TO authenticated;'),
    ).toEqual([]);
    expect(bad("CREATE TABLE a (id int); GRANT SELECT ON a TO authenticated;")).toEqual([]);
  });

  it("accepts one GRANT that names several tables", () => {
    const sql = `CREATE TABLE public.a (id int); CREATE TABLE public.b (id int);
      GRANT SELECT ON public.a, public.b TO authenticated;`;
    expect(bad(sql)).toEqual([]);
  });

  it("accepts GRANT ... ON ALL TABLES IN SCHEMA public", () => {
    expect(
      bad(
        "CREATE TABLE public.a (id int); GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;",
      ),
    ).toEqual([]);
  });

  it("a grant to PUBLIC is a client grant, so the marker cannot hide it", () => {
    expect(bad("CREATE TABLE public.a (id int); GRANT SELECT ON public.a TO PUBLIC;")).toEqual([]);
    const marked = `-- client-grants: none public.a
      CREATE TABLE public.a (id int); GRANT SELECT ON public.a TO PUBLIC;`;
    expect(bad(marked)).toEqual([]);
  });

  it("flags a policy TO anon or TO public when there is no grant", () => {
    for (const to of ["anon", "public"]) {
      const sql = `-- client-grants: none public.a
        CREATE TABLE public.a (id int);
        CREATE POLICY p ON public.a FOR SELECT TO ${to} USING (true);`;
      expect(bad(sql), to).toEqual(["a"]);
    }
  });
});

/** Migration files strictly after `cutoff` (the version is the first 14 characters of the file name). */
const migrationsAfter = (cutoff: string) =>
  fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql") && f.slice(0, 14) > cutoff)
    .sort();

describe("migrations written after the privilege tightening", () => {
  it("the file filter really lists migrations (an earlier cutoff finds many, the real one finds none yet)", () => {
    expect(migrationsAfter("20260101000000").length).toBeGreaterThan(20);
    expect(migrationsAfter(CUTOFF).some((f) => f.startsWith(CUTOFF))).toBe(false);
    expect(fs.readdirSync(MIGRATIONS).some((f) => f.startsWith(CUTOFF))).toBe(true);
  });

  it("every new table declares what clients may do with it", () => {
    const problems = migrationsAfter(CUTOFF).flatMap((f) =>
      checkNewTableGrants(fs.readFileSync(path.join(MIGRATIONS, f), "utf8")).map(
        (v) => `${f}: ${v.problem}`,
      ),
    );
    expect(problems).toEqual([]);
  });
});
