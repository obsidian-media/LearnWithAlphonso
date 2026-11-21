import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTION_LABELS,
  AUDIT_CATEGORIES,
  AUDIT_PREFIXES,
  auditSentence,
  humanizeAction,
  shortId,
} from "./audit-labels";
import { SCOPES } from "./staff-scopes";

/**
 * The Action record must never show an action it has no words for. Every action the system can write is found by
 * READING THE SOURCE (the migrations, and every server call site), not from a list kept here, so a new action added
 * anywhere without an entry in audit-labels.ts fails this test.
 */
const PREFIX = "user|note|pro|report|podcast|staff|support|settings";
const LITERAL = new RegExp(`(["'\`])((?:${PREFIX})\\.[a-z_]+(?:\\.[a-z_]+)*)\\1`, "g");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const isCode = (f: string) =>
  /\.(ts|tsx)$/.test(f) &&
  !/\.test\.tsx?$/.test(f) &&
  !f.includes("__testutils__") &&
  !/types\.ts$/.test(f) &&
  !/audit-labels\.ts$/.test(f) &&
  !/staff-scopes\.ts$/.test(f);

/** Strings that look like an action but are something else (scripts/story-audio.ts reads a file called podcast.env). */
const NOT_ACTIONS = new Set(["podcast.env"]);

/** Every action-looking literal in the source: in migrations (staff_record calls) and in TypeScript call sites. */
function sourceLiterals(): Map<string, string[]> {
  const files = [
    ...walk("supabase/migrations").filter((f) => f.endsWith(".sql")),
    ...walk("src").filter(isCode),
    ...walk("admin").filter(isCode),
    ...walk("supabase/functions").filter(isCode),
    ...walk("scripts").filter(isCode),
  ];
  const found = new Map<string, string[]>();
  for (const f of files) {
    const text = readFileSync(f, "utf8")
      // comments never write a record
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/^\s*--.*$/gm, "");
    for (const m of text.matchAll(LITERAL)) {
      const code = m[2]!;
      if (NOT_ACTIONS.has(code)) continue;
      found.set(code, [...(found.get(code) ?? []), f]);
    }
  }
  return found;
}

/**
 * LIMIT OF THE SCAN: it sees only action codes written as whole string literals. A code assembled at run time (a join
 * like 'user.un' || kind, a template like `podcast.${x}`) is invisible to it, so each such place must be listed here
 * by hand with the full codes it can produce. A new joined or templated action added without an entry here is NOT caught.
 */
/** Codes the source builds by joining text (staff_set_restriction writes 'user.un' || kind): each full code is listed. */
const BUILT_BY_JOIN: Record<string, string[]> = { "user.un": ["user.unblock", "user.unban"] };

/** Left out of the Home feed on purpose (staff-home.functions.ts filters it out as noise): the Audit screen still lists it. */
const NOT_IN_FEED = new Set(["user.view"]);

describe("every action the system writes has words in the Action record", () => {
  const literals = sourceLiterals();
  // Scope keys share a prefix with some actions (support.read is a scope, support.reply is both).
  const scopeOnly = new Set<string>(SCOPES.filter((s) => !(s in ACTION_LABELS)));

  it("finds the actions in the source at all (the scan itself works)", () => {
    expect(literals.size).toBeGreaterThan(20);
    for (const known of ["user.ban", "pro.grant", "support.reply", "podcast.episode.publish"]) {
      expect(literals.has(known), known).toBe(true);
    }
  });

  it("every action literal in the migrations and the server code has a row label", () => {
    const missing: string[] = [];
    for (const [code, files] of literals) {
      if (scopeOnly.has(code)) continue;
      const full = BUILT_BY_JOIN[code] ?? [code];
      for (const c of full) if (!(c in ACTION_LABELS)) missing.push(`${c}  (${files[0]})`);
    }
    expect(missing, "add these to ACTION_LABELS in src/lib/audit-labels.ts").toEqual([]);
  });

  it("every action literal also has a Home feed sentence (not the raw code)", () => {
    const raw: string[] = [];
    for (const code of literals.keys()) {
      if (scopeOnly.has(code) || NOT_IN_FEED.has(code)) continue;
      for (const c of BUILT_BY_JOIN[code] ?? [code]) if (auditSentence(c) === c) raw.push(c);
    }
    expect(raw, "add these to SENTENCES in src/lib/audit-labels.ts").toEqual([]);
  });

  it("the table has no stale entries: each label is still written somewhere in the source", () => {
    const written = new Set<string>([...literals.keys()].flatMap((c) => BUILT_BY_JOIN[c] ?? [c]));
    expect(Object.keys(ACTION_LABELS).filter((c) => !written.has(c))).toEqual([]);
  });

  it("the scan is blind to joined and template codes (so BUILT_BY_JOIN must be kept by hand)", () => {
    const text = "p_actor, 'user.un' || p_kind;  action: `podcast.${kind}`; action: 'staff.' + x";
    const hits = [...text.matchAll(LITERAL)].map((m) => m[2]);
    // only the stub 'user.un' is seen, never what it becomes; the templates are not seen at all
    expect(hits).toEqual(["user.un"]);
    expect(Object.keys(BUILT_BY_JOIN)).toEqual(["user.un"]);
  });

  it("the scan would catch a new action: an unmapped literal is reported", () => {
    const text = `recordStaffAction(c, { action: "user.brand_new_thing" })`;
    const hits = [...text.matchAll(LITERAL)].map((m) => m[2]);
    expect(hits).toEqual(["user.brand_new_thing"]);
    expect("user.brand_new_thing" in ACTION_LABELS).toBe(false);
  });
});

describe("humanizeAction is total", () => {
  it("maps a known code to its words and tone", () => {
    expect(humanizeAction("user.ban")).toEqual({ text: "Banned", tone: "bad", known: true });
    expect(humanizeAction("user.unban")).toMatchObject({ text: "Lifted the ban on", tone: "ok" });
    expect(humanizeAction("pro.grant")).toMatchObject({ known: true, tone: "ok" });
  });

  it("an unknown code is shown as the raw code, never hidden", () => {
    expect(humanizeAction("billing.refund")).toEqual({
      text: "billing.refund",
      tone: "info",
      known: false,
    });
  });

  it("never throws or returns blank, for any string at all", () => {
    for (const code of [
      "",
      "   ",
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
      "x".repeat(500),
    ]) {
      const label = humanizeAction(code);
      expect(label.text.length).toBeGreaterThan(0);
      expect(["ok", "info", "warn", "bad"]).toContain(label.tone);
    }
    expect(humanizeAction("constructor").known).toBe(false);
    expect(humanizeAction("constructor").text).toBe("constructor");
  });

  it("every label has a tone and words", () => {
    for (const [code, l] of Object.entries(ACTION_LABELS)) {
      expect(l.text.trim().length, code).toBeGreaterThan(0);
      expect(["ok", "info", "warn", "bad"], code).toContain(l.tone);
    }
  });
});

describe("the category filter", () => {
  it("uses only prefixes the server accepts, each in exactly one category", () => {
    const all = AUDIT_CATEGORIES.flatMap((c) => [...c.prefixes]);
    for (const p of all) expect((AUDIT_PREFIXES as readonly string[]).includes(p), p).toBe(true);
    expect([...new Set(all)].length).toBe(all.length);
  });

  it("covers every action the table knows (no labelled action is unreachable by a category)", () => {
    const all = AUDIT_CATEGORIES.flatMap((c) => [...c.prefixes]);
    for (const code of Object.keys(ACTION_LABELS)) {
      expect(
        all.some((p) => code.startsWith(p)),
        code,
      ).toBe(true);
    }
  });
});

describe("shortId", () => {
  it("shortens an id and says nothing for none", () => {
    expect(shortId("12345678-aaaa-bbbb-cccc-dddddddddddd")).toBe("12345678…");
    expect(shortId(null)).toBeNull();
  });
});
