import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Text guards for the AI consent and AI output migrations. The runtime proof is the seeded-user probe recorded in
 * docs/sql-probes.md; these pin the properties a later edit could silently drop.
 */
const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");
const FILES = {
  consent: "20261011100000_ai_consent.sql",
  output: "20261011100100_ai_output_check.sql",
  serviceOnly: "20261012300000_ai_output_blocked_service_only.sql",
} as const;
const read = (f: string) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8");
const code = (f: string) => read(f).replace(/--[^\n]*/g, "");
const fnBody = (sql: string, name: string) => {
  const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`).exec(sql);
  if (!m) throw new Error(`function ${name} not found`);
  return m[0];
};

describe("AI consent migrations", () => {
  it("sort after every migration that existed when they were written, so a database that already has those still applies them", () => {
    // The newest file on main when these were authored. Later migrations legitimately sort after them.
    const NEWEST_WHEN_AUTHORED = "20261010160000_name_onboarding_status_and_skip.sql";
    const all = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));
    expect(all).toContain(NEWEST_WHEN_AUTHORED);
    for (const f of all.filter((f) => f <= NEWEST_WHEN_AUTHORED)) {
      expect(FILES.consent > f, `${FILES.consent} must sort after ${f}`).toBe(true);
    }
    expect(FILES.consent > NEWEST_WHEN_AUTHORED).toBe(true);
    expect(FILES.output > FILES.consent).toBe(true);
    expect(all.some((f) => f.endsWith("_moderation_filter_v2.sql"))).toBe(true);
  });

  describe("ai_consent", () => {
    const sql = () => code(FILES.consent);

    it("adds a nullable consent timestamp to profiles", () => {
      expect(sql()).toMatch(
        /ALTER TABLE public\.profiles\s+ADD COLUMN IF NOT EXISTS ai_consent_at timestamptz NULL;/,
      );
    });

    it("set_ai_consent is a definer RPC with a pinned search_path that stamps now() or NULL for the caller only", () => {
      const fn = fnBody(sql(), "set_ai_consent");
      expect(fn).toContain("RETURNS timestamptz");
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toContain("SET search_path = public");
      expect(fn).toContain("CASE WHEN _granted THEN now() ELSE NULL END");
      expect(fn).toContain("WHERE p.id = _uid");
      expect(fn).toContain("GET DIAGNOSTICS _rows = ROW_COUNT;");
      expect(fn).toContain("RAISE EXCEPTION 'not-authenticated' USING ERRCODE = '42501';");
    });

    it("get_ai_consent reads the caller's own row only", () => {
      const fn = fnBody(sql(), "get_ai_consent");
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toContain("WHERE p.id = auth.uid()");
    });

    it("only signed-in users and the server may call the RPCs", () => {
      expect(sql()).toContain(
        "REVOKE ALL ON FUNCTION public.set_ai_consent(boolean) FROM PUBLIC, anon;",
      );
      expect(sql()).toContain("REVOKE ALL ON FUNCTION public.get_ai_consent() FROM PUBLIC, anon;");
      expect(sql()).toContain(
        "GRANT EXECUTE ON FUNCTION public.set_ai_consent(boolean), public.get_ai_consent() TO authenticated, service_role;",
      );
    });

    it("refuses a direct write to the column from a client role", () => {
      expect(sql()).toContain("BEFORE INSERT OR UPDATE OF ai_consent_at ON public.profiles");
      expect(sql()).toContain("RAISE EXCEPTION 'ai-consent-via-rpc-only' USING ERRCODE = '42501';");
      expect(sql()).not.toContain("app.ai_consent_write");
    });

    it("lets the server roles write the column so a review account can be reset", () => {
      const fn = fnBody(sql(), "guard_ai_consent_column");
      expect(fn).toContain("current_user IN ('service_role', 'postgres', 'supabase_admin')");
      // The bypass must come before either refusal, or it protects nothing.
      expect(fn.indexOf("current_user IN")).toBeLessThan(fn.indexOf("RAISE EXCEPTION"));
    });

    it("never backfills consent for anyone", () => {
      const outsideBodies = sql().replace(/\$\$[\s\S]*?\$\$/g, "");
      expect(outsideBodies).not.toMatch(/^\s*UPDATE\s+public\./im);
    });
  });

  describe("ai_output_check", () => {
    const sql = () => code(FILES.output);

    it("reuses the moderation filter instead of carrying a second word list", () => {
      expect(sql()).toContain("public.contains_blocked_term(left(x.t, 8000))");
      expect(sql()).not.toMatch(/ARRAY\s*\[\s*'/);
    });

    it("refuses a multi-dimensional or oversized array instead of slicing it", () => {
      const fn = fnBody(sql(), "ai_output_blocked");
      expect(fn).toContain("LANGUAGE plpgsql");
      expect(fn).toContain("array_ndims(_texts) > 1 OR cardinality(_texts) > 20");
      expect(fn).toContain("RAISE EXCEPTION 'invalid-argument' USING ERRCODE = '22023';");
      expect(fn).not.toContain("_texts[1:20]");
    });

    it("is a definer function callable by signed-in users and the server only", () => {
      const fn = fnBody(sql(), "ai_output_blocked");
      expect(fn).toContain("SECURITY DEFINER");
      expect(fn).toContain("SET search_path = public");
      expect(sql()).toContain(
        "REVOKE ALL ON FUNCTION public.ai_output_blocked(text[]) FROM PUBLIC, anon;",
      );
      expect(sql()).toContain(
        "GRANT EXECUTE ON FUNCTION public.ai_output_blocked(text[]) TO authenticated, service_role;",
      );
    });
  });

  describe("ai_output_blocked_service_only", () => {
    const sql = () => code(FILES.serviceOnly);

    it("sorts after the migration it tightens", () => {
      expect(FILES.serviceOnly > FILES.output).toBe(true);
    });

    it("takes EXECUTE away from signed-in users and keeps it for the server only", () => {
      expect(sql()).toContain(
        "REVOKE ALL ON FUNCTION public.ai_output_blocked(text[]) FROM PUBLIC, anon, authenticated;",
      );
      expect(sql()).toContain(
        "GRANT EXECUTE ON FUNCTION public.ai_output_blocked(text[]) TO service_role;",
      );
      expect(sql()).not.toMatch(/GRANT[^;]*authenticated/);
    });
  });
});
