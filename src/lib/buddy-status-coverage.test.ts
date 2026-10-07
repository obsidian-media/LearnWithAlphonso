import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import fixtures from "./buddy.fixtures.json";

const DIR = path.join(process.cwd(), "supabase", "migrations");

/** The status strings the LATEST definition of every buddy function can return. */
export function buddyStatusesFromMigrations(): Map<string, Set<string>> {
  const latest = new Map<string, string>();
  for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(DIR, file), "utf8");
    for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z_0-9]*buddy[a-z_0-9]*)\s*\(([\s\S]*?)\$\$([\s\S]*?)\$\$/gi)) {
      latest.set(m[1], m[2] + m[3]);
    }
  }
  const out = new Map<string, Set<string>>();
  for (const [name, text] of latest) {
    // `\b` sits inside the alternation: after `)` a newline is not a word boundary, so `...)\b` would skip every
    // RETURNS TABLE(status text) function and the guard could never fail on them.
    if (!/RETURNS\s+(?:TABLE\s*\(\s*status\s+text\s*\)|text\b)/i.test(text)) continue;
    const codes = new Set<string>();
    for (const m of text.matchAll(/SELECT\s+'([a-z_]+)'::text/g)) codes.add(m[1]);
    for (const m of text.matchAll(/RETURN\s+'([a-z_]+)'\s*;/g)) codes.add(m[1]);
    if (codes.size) out.set(name, codes);
  }
  return out;
}

describe("buddy statuses", () => {
  it("every status a buddy RPC can return has shared wording", () => {
    const statuses = buddyStatusesFromMigrations();
    expect(statuses.has("join_buddy_pool")).toBe(true);
    expect(statuses.has("send_buddy_message")).toBe(true);
    const messages = fixtures.messages as Record<string, string>;
    const missing = [...statuses].flatMap(([fn, codes]) => [...codes].filter((c) => !(c in messages)).map((c) => `${fn}: ${c}`));
    expect(missing).toEqual([]);
  });
});

