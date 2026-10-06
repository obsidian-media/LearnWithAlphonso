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
});
