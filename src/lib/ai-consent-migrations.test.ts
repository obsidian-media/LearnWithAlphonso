import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Text guards for the AI consent and AI output migrations. The runtime proof is the seeded-user probe recorded in
 * docs/sql-probes.md; these pin the properties a later edit could silently drop.
 */
const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");
const FILES = {
  consent: "20261009100000_ai_consent.sql",
  output: "20261009100100_ai_output_check.sql",
} as const;
const read = (f: string) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8");
const code = (f: string) => read(f).replace(/--[^\n]*/g, "");
const fnBody = (sql: string, name: string) => {
  const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`).exec(sql);
  if (!m) throw new Error(`function ${name} not found`);
  return m[0];
};

describe("AI consent migrations", () => {
  it("sort after the moderation filter they call", () => {
    const filter = fs.readdirSync(MIGRATIONS).find((f) => f.endsWith("_moderation_filter_v2.sql"));
    expect(filter, "the moderation filter v2 migration must be on main first").toBeDefined();
    expect(FILES.consent > filter!).toBe(true);
    expect(FILES.output > FILES.consent).toBe(true);
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

    it("refuses a direct write to the column unless set_ai_consent opened the switch", () => {
      expect(sql()).toContain("BEFORE INSERT OR UPDATE OF ai_consent_at ON public.profiles");
      expect(sql()).toContain("current_setting('app.ai_consent_write', true)");
      expect(sql()).toContain("RAISE EXCEPTION 'ai-consent-via-rpc-only' USING ERRCODE = '42501';");
      expect(fnBody(sql(), "set_ai_consent")).toContain(
        "set_config('app.ai_consent_write', 'off', true)",
      );
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

    it("bounds the work of one call", () => {
      expect(sql()).toContain("unnest(_texts[1:20]) WITH ORDINALITY AS x(t, i)");
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
});
