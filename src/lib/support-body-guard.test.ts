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
  [
    "support-notify.server.ts",
    "never reads a body at all (asserted below): it selects the reply's author id only",
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
      expect.arrayContaining([
        "account.functions.ts",
        "support-chat-runtime.server.ts",
        // The staff inbox reads ticket bodies (milestone 3) and strips the marker itself.
        "staff-support.server.ts",
      ]),
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

// The reply notice (email and push) and the owner digest are built from a person's label and fixed words. The surest way
// for a message body or its [[link:id]] marker never to leak into an email or a lock screen is never to read it, so the
// notification code may not select the column at all. A test of the output alone could not catch a future select("*").
describe("the notification code never reads a message body", () => {
  const NOTIFY = ["support-notify.server.ts", "support-notify.ts"];
  const notifyFiles = () =>
    ROOTS.flatMap(files).filter(
      (f) => path.dirname(f).endsWith(path.join("src", "lib")) && NOTIFY.includes(path.basename(f)),
    );

  it("finds both files (the scan is not empty)", () => {
    expect(
      notifyFiles()
        .map((f) => path.basename(f))
        .sort(),
    ).toEqual([...NOTIFY].sort());
  });

  it("selects no body column and no star from the message table, and never touches the learner's text", () => {
    const offenders: string[] = [];
    for (const f of notifyFiles()) {
      const src = readFileSync(f, "utf8");
      // Every select(...) on the message table, with its column string.
      for (const m of src.matchAll(/from\("support_messages"\)\s*\.select\(([^)]*)\)/g)) {
        if (/\bbody\b|\*/.test(m[1]!)) offenders.push(`${path.basename(f)}: select(${m[1]})`);
      }
      // The only way to see a body without select(): a row type that carries one.
      const code = src
        .split("\n")
        .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
        .join("\n");
      if (/\.body\b/.test(code.replace(/push\.body|init\.body/g, ""))) {
        offenders.push(`${path.basename(f)}: reads .body`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
