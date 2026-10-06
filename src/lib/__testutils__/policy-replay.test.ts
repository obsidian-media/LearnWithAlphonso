import { describe, expect, it } from "vitest";
import { replayPoliciesFromSql } from "./policy-replay";

const cmds = (sql: string, table: string) =>
  [...(replayPoliciesFromSql(sql).get(table) ?? [])].sort();

describe("replayPoliciesFromSql", () => {
  it("counts FOR <cmd> and FOR ALL, and a missing FOR as ALL", () => {
    expect(
      cmds("CREATE POLICY a ON public.t FOR INSERT TO authenticated WITH CHECK (true);", "t"),
    ).toEqual(["INSERT"]);
    expect(cmds("CREATE POLICY a ON public.t FOR ALL TO authenticated USING (true);", "t")).toEqual(
      ["DELETE", "INSERT", "SELECT", "UPDATE"],
    );
    expect(cmds("CREATE POLICY a ON public.t TO authenticated USING (true);", "t")).toHaveLength(4);
  });

  it("a policy with no TO clause applies to everyone, so it counts", () => {
    expect(cmds("CREATE POLICY a ON public.t FOR INSERT WITH CHECK (true);", "t")).toEqual([
      "INSERT",
    ]);
    expect(
      cmds("CREATE POLICY a ON public.t FOR INSERT TO public WITH CHECK (true);", "t"),
    ).toEqual(["INSERT"]);
  });

  it("a policy only for service_role does not back a user-client write", () => {
    expect(cmds("CREATE POLICY a ON public.t FOR ALL TO service_role USING (true);", "t")).toEqual(
      [],
    );
  });

  it("a policy for anon does not back an authenticated write", () => {
    expect(cmds("CREATE POLICY a ON public.t FOR INSERT TO anon WITH CHECK (true);", "t")).toEqual(
      [],
    );
  });

  it("a policy listing several roles counts if authenticated is one of them", () => {
    expect(
      cmds(
        "CREATE POLICY a ON public.t FOR UPDATE TO service_role, authenticated USING (true);",
        "t",
      ),
    ).toEqual(["UPDATE"]);
  });

  it("a dropped policy no longer counts, and a re-created one does again", () => {
    const create = "CREATE POLICY a ON public.t FOR DELETE TO authenticated USING (true);";
    expect(cmds(`${create} DROP POLICY IF EXISTS a ON public.t;`, "t")).toEqual([]);
    expect(cmds(`${create} DROP POLICY a ON public.t; ${create}`, "t")).toEqual(["DELETE"]);
  });

  it("ignores policy text inside comments", () => {
    expect(
      cmds("-- CREATE POLICY a ON public.t FOR ALL TO authenticated USING (true);", "t"),
    ).toEqual([]);
  });

  it("handles quoted names and multi-line statements", () => {
    const sql = `CREATE POLICY "a b" ON public.t
      FOR UPDATE
      TO authenticated
      USING (true);`;
    expect(cmds(sql, "t")).toEqual(["UPDATE"]);
  });

  it("can replay for the anon role: only TO anon, TO public or no TO clause counts", () => {
    const forAnon = (sql: string) => [...(replayPoliciesFromSql(sql, "anon").get("t") ?? [])];
    expect(forAnon("CREATE POLICY a ON public.t FOR SELECT USING (true);")).toEqual(["SELECT"]);
    expect(forAnon("CREATE POLICY a ON public.t FOR SELECT TO public USING (true);")).toEqual([
      "SELECT",
    ]);
    expect(forAnon("CREATE POLICY a ON public.t FOR SELECT TO anon USING (true);")).toEqual([
      "SELECT",
    ]);
    expect(
      forAnon("CREATE POLICY a ON public.t FOR SELECT TO authenticated USING (true);"),
    ).toEqual([]);
    expect(forAnon("CREATE POLICY a ON public.t FOR SELECT TO service_role USING (true);")).toEqual(
      [],
    );
  });
});
