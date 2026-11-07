import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Text guards for the Practice stars migration. The behaviour itself (keep-best, refused stale tallies, refused
 * client writes, cascade) was executed in a real Postgres as seeded users before merge; these pin the properties
 * that make forging stars impossible, so a later edit cannot quietly undo them. Located by NAME, never by version.
 */
const DIR = "supabase/migrations";
const found = readdirSync(DIR).filter((f) => f.endsWith("_practice_stars.sql"));
if (found.length !== 1) throw new Error(`expected one *_practice_stars.sql, found ${found.length}`);
const raw = readFileSync(path.join(DIR, found[0]!), "utf8");
const sql = raw.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");

const fnBody = (name: string) => {
  const m = new RegExp(`CREATE FUNCTION public\\.${name}\\(.*?\\$\\$(.*?)\\$\\$`, "s").exec(sql);
  if (!m) throw new Error(`no function ${name}`);
  return { header: m[0], body: m[1] };
};

describe("practice stars migration", () => {
  for (const table of ["practice_calls", "practice_stars"]) {
    it(`${table}: rows go with the account`, () => {
      expect(sql).toMatch(
        new RegExp(
          `CREATE TABLE public\\.${table} \\(.*?user_id uuid NOT NULL REFERENCES auth\\.users\\(id\\) ON DELETE CASCADE`,
        ),
      );
    });
    it(`${table}: RLS on, own rows only, and clients may only SELECT`, () => {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(
        `ON public.${table} FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id)`,
      );
      expect(sql).toContain(`REVOKE ALL ON public.${table} FROM PUBLIC, anon, authenticated`);
      const clientGrants = [
        ...sql.matchAll(new RegExp(`GRANT ([A-Z, ]+) ON public\\.${table} TO (\\w+)`, "g")),
      ]
        .filter((g) => g[2] !== "service_role")
        .map((g) => `${g[1]} -> ${g[2]}`);
      expect(clientGrants).toEqual(["SELECT -> authenticated"]);
      expect(sql).not.toMatch(
        new RegExp(`CREATE POLICY \\w+ ON public\\.${table} FOR (INSERT|UPDATE|DELETE|ALL)`),
      );
    });
  }

  it("best stars are 1 to 3", () => {
    expect(sql).toContain("best_stars smallint NOT NULL CHECK (best_stars BETWEEN 1 AND 3)");
  });

  for (const name of ["record_practice_reply", "finish_practice_call"]) {
    it(`${name}: SECURITY DEFINER with an empty search_path, executable by the service role only`, () => {
      const { header } = fnBody(name);
      expect(header).toContain("SECURITY DEFINER SET search_path = ''");
      expect(sql).toMatch(
        new RegExp(
          `REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon, authenticated`,
        ),
      );
      const grants = [
        ...sql.matchAll(
          new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO ([^;]+);`, "g"),
        ),
      ];
      // The whole grantee list, so "TO service_role, authenticated" cannot pass as "service_role".
      expect(grants.map((g) => g[1].trim())).toEqual(["service_role"]);
    });
  }

  it("keep-best is enforced in SQL with greatest()", () => {
    expect(fnBody("finish_practice_call").body).toContain(
      "best_stars = greatest(s.best_stars, EXCLUDED.best_stars)",
    );
  });

  it("a call is finished once, by its owner, only at the tally the stars were computed from", () => {
    const { body } = fnBody("finish_practice_call");
    for (const cond of ["c.user_id = _user_id", "c.finished_at IS NULL", "c.replies = _replies"]) {
      expect(body).toContain(cond);
    }
  });

  it("a reply joins a call only of the same user, course and item, and never a finished one", () => {
    const { body } = fnBody("record_practice_reply");
    for (const col of ["user_id", "course", "kind", "item_key"]) {
      expect(body).toContain(`c.${col} = EXCLUDED.${col}`);
    }
    expect(body).toContain("c.finished_at IS NULL");
  });
});
