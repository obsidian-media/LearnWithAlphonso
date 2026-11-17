import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dir = path.join(process.cwd(), "supabase/migrations");
const file = "20261120120000_ai_monthly_cost_cap.sql";
const sql = readFileSync(path.join(dir, file), "utf8");
const code = sql.replace(/--[^\n]*/g, "");

describe(`${file} (rehearsed on the real database in BEGIN..ROLLBACK, see the PR)`, () => {
  it("is versioned after every other migration", () => {
    const others = readdirSync(dir).filter((f) => f.endsWith(".sql") && f !== file);
    expect(others.every((f) => f.slice(0, 14) < file.slice(0, 14))).toBe(true);
  });
  it("adds no table and no policy", () => {
    expect(code).not.toMatch(/CREATE TABLE|CREATE POLICY/i);
  });
  it("the learner's read is for signed-in learners only, by auth.uid(), never PUBLIC or anon", () => {
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION public\.my_ai_cost_month\(\) FROM PUBLIC, anon, authenticated/,
    );
    expect(code).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.my_ai_cost_month\(\) TO authenticated, service_role/,
    );
    expect(code).toMatch(/auth\.uid\(\)/);
  });
  it("the admin count is service role only", () => {
    expect(code).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.admin_ai_cost_capped\(bigint, bigint\) TO service_role;/,
    );
    expect(code).not.toMatch(/admin_ai_cost_capped\(bigint, bigint\) TO [^;]*authenticated/);
  });
  it("both functions pin search_path and are SECURITY DEFINER", () => {
    expect(code.match(/SECURITY DEFINER/g)!.length).toBe(2);
    expect(code.match(/SET search_path = ''/g)!.length).toBe(2);
  });
});
