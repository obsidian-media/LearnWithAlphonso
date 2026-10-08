import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIR = path.resolve(import.meta.dirname, "../../supabase/migrations");
const FILE = "20261010160000_name_onboarding_status_and_skip.sql";
const DEPENDS_ON = "20261008130100_display_name_onboarding.sql";
const sql = () => fs.readFileSync(path.join(DIR, FILE), "utf8");

/** The statement from CREATE OR REPLACE FUNCTION public.<name>( to its closing $$; */
function fnStatement(name: string): string {
  const text = sql();
  const start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf("$$;", start);
  return text.slice(start, end + 3);
}

describe("name onboarding migration", () => {
  it("sorts after the migration it depends on", () => {
    expect(fs.existsSync(path.join(DIR, DEPENDS_ON))).toBe(true);
    expect(FILE > DEPENDS_ON).toBe(true);
  });

  it("get_my_name_status returns only the caller's own row", () => {
    const stmt = fnStatement("get_my_name_status");
    expect(stmt).toMatch(/RETURNS TABLE \(display_name text, name_confirmed_at timestamptz\)/);
    expect(stmt).toMatch(/SECURITY DEFINER\s+SET search_path = public/);
    expect(stmt).toContain("WHERE p.id = auth.uid()");
    expect(sql()).toContain(
      "REVOKE ALL ON FUNCTION public.get_my_name_status() FROM PUBLIC, anon;",
    );
    expect(sql()).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_my_name_status() TO authenticated;",
    );
  });

  it("skip_display_name_prompt keeps a clean handle or stores a fresh one, and stamps the confirmation", () => {
    const stmt = fnStatement("skip_display_name_prompt");
    expect(stmt).toMatch(
      /RETURNS text\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public/,
    );
    expect(stmt).toContain("current_name ~ '^Learner-[0-9A-F]{4}$'");
    expect(stmt).toContain("public.generate_learner_handle()");
    expect(stmt).toContain("public.display_name_problem(candidate) IS NULL");
    expect(stmt).toContain("name_confirmed_at = now()");
    expect(stmt).toContain("RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'P0001'");
    expect(sql()).toContain(
      "REVOKE ALL ON FUNCTION public.skip_display_name_prompt() FROM PUBLIC, anon;",
    );
    expect(sql()).toContain(
      "GRANT EXECUTE ON FUNCTION public.skip_display_name_prompt() TO authenticated;",
    );
  });

  it("never writes anyone else's profile", () => {
    const stmt = fnStatement("skip_display_name_prompt");
    expect(stmt).toMatch(
      /UPDATE public\.profiles p\s+SET display_name = candidate, name_confirmed_at = now\(\)\s+WHERE p\.id = me/,
    );
  });
});
