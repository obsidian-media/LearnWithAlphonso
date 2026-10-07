import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIR = path.join(process.cwd(), "supabase", "migrations");
const FILES = {
  filter: "20261008130000_moderation_filter_v2.sql",
} as const;
const read = (file: string) => fs.readFileSync(path.join(DIR, file), "utf8");

/** One CREATE OR REPLACE FUNCTION statement, header through the closing `$$;`. */
function fn(file: string, name: string): string {
  const sql = read(file);
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`${name} is not defined in ${file}`);
  const bodyStart = sql.indexOf("$$", start);
  return sql.slice(start, sql.indexOf("$$;", bodyStart + 2) + 3);
}
const header = (stmt: string) => stmt.slice(0, stmt.indexOf("$$"));

describe("W7 migrations: ordering", () => {
  it("are unique, in order, and after buddy matching", () => {
    const all = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql"));
    const ours = Object.values(FILES);
    for (const f of ours) {
      expect(all, f).toContain(f);
      expect(f > "20261007120000_buddy_matching.sql").toBe(true);
      expect(all.filter((x) => x.slice(0, 14) === f.slice(0, 14))).toHaveLength(1);
    }
    expect([...ours].sort()).toEqual(ours);
  });
});

describe("moderation filter v2", () => {
  const file = FILES.filter;
  const helpers = [
    "moderation_clean_text(text)",
    "normalize_for_moderation(text)",
    "blocked_moderation_terms()",
    "moderation_anywhere_patterns()",
    "moderation_edge_patterns()",
    "moderation_contextual_terms()",
    "moderation_context_markers()",
    "moderation_allowlist_pattern()",
    "contains_blocked_term(text)",
    "enforce_display_name_filter()",
  ];

  it("pins search_path on every function", () => {
    for (const sig of [...helpers, "display_name_problem(text)"]) {
      const name = sig.slice(0, sig.indexOf("("));
      expect(header(fn(file, name)), name).toMatch(/SET search_path = ''/);
    }
  });

  it("no client role may read the lists or run the matcher directly", () => {
    const sql = read(file);
    for (const sig of helpers) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC, anon, authenticated;`);
    }
    // Every GRANT that names a helper, in any position of a multi-function list, may go only to service_role.
    const grants = sql
      .split(";")
      .map((stmt) => stmt.replace(/--[^\n]*/g, "").trim())
      .filter((stmt) => /^GRANT\b/i.test(stmt) && helpers.some((sig) => stmt.includes(`public.${sig}`)));
    expect(grants.length).toBeGreaterThan(0);
    for (const stmt of grants) {
      const to = stmt.slice(stmt.search(/\bTO\b/i));
      expect(to, stmt).not.toMatch(/\b(anon|authenticated|public)\b/i);
    }
  });

  it("admin_rename_team is a service-only definer", () => {
    const head = header(fn(file, "admin_rename_team"));
    expect(head).toMatch(/SECURITY DEFINER/);
    expect(head).toMatch(/SET search_path = public/);
    expect(read(file)).toContain("REVOKE ALL ON FUNCTION public.admin_rename_team(uuid, text) FROM PUBLIC, anon, authenticated;");
    expect(read(file)).toContain("GRANT EXECUTE ON FUNCTION public.admin_rename_team(uuid, text) TO service_role;");
  });

  it("the trigger and the verdict run as definer, so revoking the helpers cannot break a client write", () => {
    expect(header(fn(file, "enforce_display_name_filter"))).toMatch(/SECURITY DEFINER/);
    expect(header(fn(file, "display_name_problem"))).toMatch(/SECURITY DEFINER/);
    expect(read(file)).toContain("GRANT EXECUTE ON FUNCTION public.display_name_problem(text) TO authenticated, service_role;");
  });

  it("folds NFKC, strips invisible and bidi characters, and drops combining marks", () => {
    const clean = fn(file, "moderation_clean_text");
    expect(clean).toContain("normalize(coalesce(input, ''), NFKC)");
    for (const range of ["\\u200B-\\u200F", "\\u202A-\\u202E", "\\u2066-\\u206F", "\\uFEFF", "\\u3164"]) {
      expect(clean, range).toContain(range);
    }
    expect(fn(file, "normalize_for_moderation")).toContain("'[\\u0300-\\u036f]'");
  });

  it("keeps the list in normalized ASCII and moves name-words to the contextual list", () => {
    // Only the array literal: the header's `search_path = ''` would otherwise pair up with the first term's quote.
    const arrayOf = (name: string) => {
      const stmt = fn(file, name);
      return [...stmt.slice(stmt.indexOf("ARRAY[")).matchAll(/'([^']+)'/g)].map((m) => m[1]);
    };
    const terms = arrayOf("blocked_moderation_terms");
    expect(terms.length).toBeGreaterThanOrEqual(40);
    for (const t of terms) expect(t, t).toMatch(/^[a-z]+$/);
    for (const name of ["dick", "cock", "coon", "cox", "gay"]) expect(terms).not.toContain(name);
    const contextual = arrayOf("moderation_contextual_terms");
    expect(contextual).toEqual(["dick", "cock", "coon", "cox", "gay"]);
  });

  it("the trigger raises 23514 with the blocked-content code clients map", () => {
    expect(fn(file, "enforce_display_name_filter")).toContain("RAISE EXCEPTION 'blocked-content' USING ERRCODE = '23514';");
  });
});
