import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");
const FILE = "20261006100000_learning_goals.sql";

describe("learning_goals migration", () => {
  const sql = () => fs.readFileSync(path.join(MIGRATIONS, FILE), "utf8");

  it("is newer than the latest migration it follows", () => {
    expect(FILE.slice(0, 14) > "20261005120000").toBe(true);
  });
  it("keys one goal per user and course and cascades with the account", () => {
    expect(sql()).toContain("PRIMARY KEY (user_id, language)");
    expect(sql()).toContain("REFERENCES auth.users(id) ON DELETE CASCADE");
  });
  it("constrains course and target level to the values the route accepts", () => {
    expect(sql()).toContain("CHECK (language IN ('en', 'fr', 'es'))");
    expect(sql()).toContain("CHECK (target_level IN ('A1', 'A2', 'B1', 'B2', 'C1'))");
  });
  it("lets a user READ their own goal only and gives clients no write grant", () => {
    const s = sql();
    expect(s).toContain("ENABLE ROW LEVEL SECURITY");
    expect(s).toContain("GRANT SELECT ON public.learning_goals TO authenticated");
    expect(s).toContain("FOR SELECT TO authenticated");
    expect(s).toContain("(SELECT auth.uid()) = user_id");
    expect(s).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated/);
  });

  // Production check on 2026-10-06 found that Supabase's default privileges had given BOTH
  // anon and authenticated INSERT/UPDATE/DELETE/TRUNCATE on the new table (the first
  // migration only added a SELECT grant on top, and its text test could not see defaults).
  // RLS had no write policy, so nothing was exploitable, but the privileges must match the
  // intent: a follow-up migration revokes everything and re-grants SELECT.
  describe("follow-up that revokes the default grants", () => {
    const FOLLOW = "20261006110000_learning_goals_revoke_default_grants.sql";
    const follow = () => fs.readFileSync(path.join(MIGRATIONS, FOLLOW), "utf8");

    it("runs after the table is created", () => {
      expect(FOLLOW.slice(0, 14) > FILE.slice(0, 14)).toBe(true);
    });
    it("revokes every privilege from anon and from authenticated, then re-grants only SELECT", () => {
      const s = follow();
      expect(s).toContain("REVOKE ALL ON public.learning_goals FROM anon");
      expect(s).toContain("REVOKE ALL ON public.learning_goals FROM authenticated");
      expect(s).toContain("GRANT SELECT ON public.learning_goals TO authenticated");
      expect(s.indexOf("REVOKE ALL ON public.learning_goals FROM authenticated")).toBeLessThan(
        s.indexOf("GRANT SELECT ON public.learning_goals TO authenticated"),
      );
      expect(s).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE|TRUNCATE|ALL)[^;]*TO (authenticated|anon)/);
    });
  });
});
