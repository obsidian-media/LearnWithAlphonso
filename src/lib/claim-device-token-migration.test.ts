import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIR = path.resolve(import.meta.dirname, "../../supabase/migrations");
const FILE = "20261012200000_claim_device_token.sql";
const DEPENDS_ON = "20260930170000_device_tokens_android.sql";
const sql = () => fs.readFileSync(path.join(DIR, FILE), "utf8");

describe("claim_device_token migration", () => {
  it("sorts after the migration it depends on", () => {
    expect(fs.existsSync(path.join(DIR, DEPENDS_ON))).toBe(true);
    expect(FILE > DEPENDS_ON).toBe(true);
  });

  it("is a definer function with a pinned search_path, closed to anon", () => {
    const text = sql();
    expect(text).toMatch(
      /CREATE OR REPLACE FUNCTION public\.claim_device_token\(_token text, _platform text\)\s+RETURNS void\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public/,
    );
    expect(text).toContain("REVOKE ALL ON FUNCTION public.claim_device_token(text, text) FROM PUBLIC, anon;");
    expect(text).toContain("GRANT EXECUTE ON FUNCTION public.claim_device_token(text, text) TO authenticated;");
  });

  it("removes only OTHER users' rows for this token, then writes the caller's own row", () => {
    const text = sql();
    expect(text).toMatch(/DELETE FROM public\.device_tokens\s+WHERE token = _token AND user_id <> me;/);
    expect(text).toMatch(/INSERT INTO public\.device_tokens \(user_id, token, platform\)\s+VALUES \(me, _token, _platform\)/);
    expect(text).toContain("ON CONFLICT (user_id, token)");
    expect(text.indexOf("DELETE FROM public.device_tokens")).toBeLessThan(text.indexOf("INSERT INTO public.device_tokens"));
    expect(text).toContain("RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'P0001'");
  });
});
