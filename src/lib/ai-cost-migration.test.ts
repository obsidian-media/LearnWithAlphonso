import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261118200000_ai_cost_log.sql"),
  "utf8",
);
const code = sql.replace(/--[^\n]*/g, "");

describe("20261118200000_ai_cost_log.sql (the real database was rehearsed in BEGIN..ROLLBACK, see the PR)", () => {
  it("every new table is service-role only: RLS on, nothing for clients, no policy", () => {
    for (const t of ["ai_cost_log", "ai_cost_daily", "ai_cost_alert_days"]) {
      expect(code).toMatch(
        new RegExp(String.raw`ALTER TABLE public\.${t} ENABLE ROW LEVEL SECURITY`),
      );
      expect(code).toMatch(
        new RegExp(String.raw`REVOKE ALL ON public\.${t} FROM PUBLIC, anon, authenticated`),
      );
      expect(code).toMatch(new RegExp(String.raw`GRANT ALL ON public\.${t} TO service_role`));
      expect(sql).toMatch(new RegExp(String.raw`-- client-grants: none public\.${t}\b`));
    }
    expect(code).not.toMatch(/CREATE POLICY/);
    expect(code).not.toMatch(/GRANT [^;]* TO (anon|authenticated|PUBLIC)/i);
  });
  it("every function is revoked from the client roles and granted to service_role only", () => {
    const fns = [...code.matchAll(/CREATE FUNCTION public\.(\w+)\(([^)]*)\)/g)];
    expect(fns.length).toBe(6);
    for (const [, name] of fns) {
      expect(code).toMatch(
        new RegExp(
          String.raw`REVOKE ALL ON FUNCTION public\.${name}\([^)]*\) FROM PUBLIC, anon, authenticated`,
        ),
      );
      expect(code).toMatch(
        new RegExp(String.raw`GRANT EXECUTE ON FUNCTION public\.${name}\([^)]*\) TO service_role`),
      );
    }
    expect(code.match(/SECURITY DEFINER/g)!.length).toBe(6);
    expect(code.match(/SET search_path = ''/g)!.length).toBe(6);
  });
  it("the speech bucket is private and gets no storage policy", () => {
    expect(code).toMatch(/VALUES \('tts-cache', 'tts-cache', false,/);
    expect(code).not.toMatch(/storage\.objects/);
  });
  it("a deleted account takes its rows with it", () => {
    expect(code.match(/REFERENCES auth\.users\(id\) ON DELETE CASCADE/g)!.length).toBe(2);
  });
});
