import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Other learners see only display_name and avatar_seed (and the leaderboard's
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
    why: "Country board filter and per-row country label (user-chosen; disclosed in the privacy policy)",
  },
  get_ai_consent: {
    cols: ["ai_consent_at"],
    ownRowOnly: true,
    why: "the caller's own AI consent",
  },
  set_ai_consent: {
    cols: ["ai_consent_at"],
    ownRowOnly: true,
    why: "the caller's own AI consent",
  },
  get_my_name_status: {
    cols: ["name_confirmed_at"],
    ownRowOnly: true,
    why: "the caller's own name-prompt state",
  },
  skip_display_name_prompt: {
    cols: ["name_confirmed_at"],
    ownRowOnly: true,
    why: "the caller's own name-prompt state",
  },
  confirm_display_name: {
    cols: ["name_confirmed_at"],
    ownRowOnly: true,
    why: "the caller confirms their own name",
  },
  admin_reset_display_name: {
    cols: ["name_confirmed_at"],
    ownRowOnly: false,
    why: "service role only (admin name reset)",
  },
  _reset_failing_public_names: {
    cols: ["name_confirmed_at"],
    ownRowOnly: false,
    why: "service role only (one-time name reset)",
  },
};

/** Functions that name profiles without an alias, each reviewed: what they read or write, and why it is safe. */
const UNALIASED_OK: Record<string, string> = {};

function latestFunctions(): Map<string, string> {
  const latest = new Map<string, string>();
  for (const file of fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = fs.readFileSync(path.join(DIR, file), "utf8");
    for (const m of sql.matchAll(
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z_0-9]+)\s*\(([\s\S]*?)(\$[a-z_0-9]*\$)([\s\S]*?)\3/gi,
    )) {
      // Any dollar-quote tag: the body ends at the tag that opened it. Comments are not reads.
      latest.set(m[1], m[4].replace(/--[^\n]*/g, ""));
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

const PROFILES_REF =
  /(?:FROM|JOIN|UPDATE)\s+(?:public\.)?profiles\b(?:\s+(?:AS\s+)?([a-z_][a-z_0-9]*))?/gi;

/** Sensitive columns a body reads through an alias of profiles, or as profiles.<column> / public.profiles.<column>. */
export function sensitiveProfileReads(body: string): string[] {
  const aliases = [...body.matchAll(PROFILES_REF)]
    .map((m) => (m[1] ?? "").toLowerCase())
    .filter((a) => a && !KEYWORDS.has(a));
  const hits = new Set<string>();
  for (const a of [...aliases, "profiles", "public\\.profiles"]) {
    const re = new RegExp(`(?<![a-z_0-9.])${a}\\.(${SENSITIVE.join("|")})\\b`, "gi");
    for (const m of body.matchAll(re)) hits.add(m[1].toLowerCase());
  }
  return [...hits].sort();
}

/** True when the body references profiles without an alias, so its column reads cannot be attributed. */
export function hasUnaliasedProfileRef(body: string): boolean {
  return [...body.matchAll(PROFILES_REF)].some((m) => !m[1] || KEYWORDS.has(m[1].toLowerCase()));
}

describe("profile exposure through SQL", () => {
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
  it("a function that names profiles without an alias is allowlisted as a known existence check or write", () => {
    const unaliased = [...latestFunctions()]
      .filter(([, body]) => hasUnaliasedProfileRef(body))
      .map(([name]) => name)
      .filter((name) => !(name in UNALIASED_OK))
      .sort();
    expect(unaliased).toEqual([]);
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
    expect(
      sensitiveProfileReads("SELECT public.profiles.theme FROM public.profiles WHERE true"),
    ).toEqual(["theme"]);
    expect(sensitiveProfileReads("SELECT q.country FROM profiles q")).toEqual(["country"]);
    expect(hasUnaliasedProfileRef("SELECT theme FROM public.profiles WHERE id = me")).toBe(true);
    expect(hasUnaliasedProfileRef("SELECT p.theme FROM public.profiles p WHERE p.id = me")).toBe(
      false,
    );
  });
});
