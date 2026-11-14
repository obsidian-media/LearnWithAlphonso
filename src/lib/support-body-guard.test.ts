import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// An AI answer's link lives in support_messages.body as a trailing [[link:id]] marker. Any code that reads that body
// to display, export or hand to a model must go through the parser (support-links.ts), or the marker leaks as text.
// Milestone 3 (the staff inbox) is covered by this test: a new reader that skips the parser fails here.
const SANITIZERS = ["splitSupportLink", "stripSupportLink", "presentSupportMessages"];
// Readers that hand the raw body on and are sanitised downstream (named so the exception is reviewable).
const DOWNSTREAM = new Map([
  [
    "support-chat-runtime.server.ts",
    "support-ai.server.ts strips ai bodies in buildSupportMessages",
  ],
]);
const ROOTS = ["src", "admin", "supabase/functions"];
const SKIP = /(\.test\.|__testutils__|integrations[\\/]supabase[\\/]types|routeTree\.gen)/;

function files(dir: string): string[] {
  let out: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of names) {
    if (n === "node_modules") continue;
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) out = out.concat(files(p));
    else if (/\.(ts|tsx)$/.test(n) && !SKIP.test(p)) out.push(p);
  }
  return out;
}

const readers = () =>
  ROOTS.flatMap(files).filter((f) => /support_messages/.test(readFileSync(f, "utf8")));

describe("every reader of support_messages.body goes through the link parser", () => {
  it("finds the known readers (the scan is not empty)", () => {
    expect(readers().map((f) => path.basename(f))).toEqual(
      expect.arrayContaining(["account.functions.ts", "support-chat-runtime.server.ts"]),
    );
  });
  it("each one uses a sanitizer or is a named downstream-sanitised exception", () => {
    const bad = readers().filter((f) => {
      const base = path.basename(f);
      if (base === "support-links.ts" || DOWNSTREAM.has(base)) return false;
      const src = readFileSync(f, "utf8");
      return !SANITIZERS.some((s) => src.includes(s));
    });
    expect(bad).toEqual([]);
  });
});
