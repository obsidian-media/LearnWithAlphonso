import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Owner decision O3 (W7 addendum A1): other learners see only display_name and avatar_seed (and the leaderboard's
// user-chosen country). RLS now limits direct reads to the caller's own row, but SECURITY DEFINER functions and
// default-security views bypass RLS, so this guard reads the LATEST definition of every function in the
// migrations and fails when one reads a sensitive profiles column without an allowlisted reason.
const DIR = path.join(process.cwd(), "supabase", "migrations");
const SENSITIVE = [
  "country",
  "ai_consent_at",
  "name_confirmed_at",
  "theme",
  "created_at",
  "updated_at",
  "active_language",
];

/** function -> sensitive columns it may read, and why. Own-row readers must also filter on the caller. */
const ALLOWED: Record<string, { cols: string[]; ownRowOnly: boolean; why: string }> = {
  get_leaderboard: {
    cols: ["country"],
    ownRowOnly: false,
    why: "Country board filter and per-row country label (user-chosen; W9 discloses)",
  },
  get_ai_consent: {
    cols: ["ai_consent_at"],
    ownRowOnly: true,
    why: "W3: the caller's own consent",
  },
  set_ai_consent: {
    cols: ["ai_consent_at"],
    ownRowOnly: true,
    why: "W3: the caller's own consent",
  },
  get_my_name_status: {
    cols: ["name_confirmed_at"],
    ownRowOnly: true,
    why: "W6: the caller's own prompt state",
  },
  skip_display_name_prompt: { cols: ["name_confirmed_at"], ownRowOnly: true, why: "W6" },
  confirm_display_name: { cols: ["name_confirmed_at"], ownRowOnly: true, why: "W7 Task 3" },
  admin_reset_display_name: {
    cols: ["name_confirmed_at"],
    ownRowOnly: false,
    why: "service role only (W7 Task 3)",
  },
  _reset_failing_public_names: {
    cols: ["name_confirmed_at"],
    ownRowOnly: false,
    why: "service role only (W7 A8)",
  },
};

function latestFunctions(): Map<string, string> {
  const latest = new Map<string, string>();
  for (const file of fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = fs.readFileSync(path.join(DIR, file), "utf8");
    for (const m of sql.matchAll(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z_0-9]+)\s*\(([\s\S]*?)\$\$([\s\S]*?)\$\$/gi,
    )) {
      latest.set(m[1], m[3]);
    }
  }
  return latest;
}

const KEYWORDS = new Set([
  "where",
  "set",
  "on",
  "join",
  "left",
  "inner",
  "using",
  "order",
  "group",
  "limit",
  "for",
]);

/** Sensitive columns a body reads through an alias of public.profiles. */
export function sensitiveProfileReads(body: string): string[] {
  const aliases = [
    ...body.matchAll(/(?:FROM|JOIN|UPDATE)\s+public\.profiles\s+(?:AS\s+)?([a-z_][a-z_0-9]*)/gi),
  ]
    .map((m) => m[1].toLowerCase())
    .filter((a) => !KEYWORDS.has(a));
  const hits = new Set<string>();
  for (const a of aliases) {
    for (const m of body.matchAll(new RegExp(`\\b${a}\\.(${SENSITIVE.join("|")})\\b`, "gi")))
      hits.add(m[1].toLowerCase());
  }
  return [...hits].sort();
}

describe("profile exposure through SQL (O3)", () => {
  it("no function reads a sensitive profiles column unless allowlisted with a reason", () => {
    const offenders: string[] = [];
    for (const [name, body] of latestFunctions()) {
      for (const col of sensitiveProfileReads(body)) {
        const rule = ALLOWED[name];
        if (!rule || !rule.cols.includes(col)) offenders.push(`${name}: ${col}`);
      }
    }
    expect(offenders).toEqual([]);
  });
  it("own-row allowlisted functions filter on the caller", () => {
    const fns = latestFunctions();
    for (const [name, rule] of Object.entries(ALLOWED)) {
      const body = fns.get(name);
      if (!body || !rule.ownRowOnly) continue; // planned in a later WS, or service-only
      expect(body, name).toMatch(/\.id\s*=\s*(auth\.uid\(\)|me)\b/);
    }
  });
  it("no migration creates a view over public.profiles (a default view bypasses RLS)", () => {
    for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".sql"))) {
      const sql = fs.readFileSync(path.join(DIR, file), "utf8");
      for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW[\s\S]*?;/gi)) {
        expect(m[0], file).not.toMatch(/public\.profiles\b/);
      }
    }
  });
  it("the alias scanner sees a leak (self-test)", () => {
    expect(
      sensitiveProfileReads("SELECT p.display_name, p.theme FROM public.profiles p JOIN x ON true"),
    ).toEqual(["theme"]);
    expect(sensitiveProfileReads("SELECT o.display_name FROM public.profiles o")).toEqual([]);
  });
});
