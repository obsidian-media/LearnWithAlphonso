import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ADMIN_FUNCTION_NAMES, wouldCreateCycle } from "./admin.functions";

// The failure mode of this entire design is ONE admin server function
// added later without the gate. A reviewer will not notice a missing
// `.middleware([requireAdmin])` line in a file of similar-looking
// exports; this test will.
//
// It reads the source rather than introspecting the exported objects
// because TanStack's server-function wrapper does not expose its
// middleware chain at runtime -- and a test that cannot observe the
// thing it claims to check is worse than no test.
describe("every admin server function is gated", () => {
  const source = readFileSync("src/lib/admin.functions.ts", "utf8");

  it("exports at least one admin function", () => {
    // Guards the guard: if the list were empty, every assertion below
    // would pass vacuously and this file would become a test that
    // cannot fail -- this repo's most common defect.
    expect(ADMIN_FUNCTION_NAMES.length).toBeGreaterThan(0);
  });

  it("declares createServerFn exactly as many times as it lists names", () => {
    const declared = source.match(/createServerFn\(/g)?.length ?? 0;
    expect(declared).toBe(ADMIN_FUNCTION_NAMES.length);
  });

  it("carries requireAdmin on every createServerFn", () => {
    const gated = source.match(/\.middleware\(\[requireAdmin\]\)/g)?.length ?? 0;
    expect(gated).toBe(ADMIN_FUNCTION_NAMES.length);
  });

  it("never uses requireSupabaseAuth alone in this file", () => {
    // requireAdmin already chains it. Importing it here would be the
    // shape of an endpoint gated at the wrong level: authenticated, but
    // not authorized.
    expect(source).not.toContain("requireSupabaseAuth");
  });

  it("exports every name it lists", () => {
    // Catches the other direction: a name added to the list for a
    // function that was never written, which would make the two count
    // assertions above disagree for a reason nobody could find.
    for (const name of ADMIN_FUNCTION_NAMES) {
      expect(source).toMatch(new RegExp(`export const ${name}\\b`));
    }
  });
});

// Review Focus #4. In the CLI a cycle needed a typo; in a folder tree
// with a parent picker it is two clicks. A cycle makes the branch
// unreachable from the root and invisible in both apps, which reads to
// the person who made it as data loss.
describe("wouldCreateCycle", () => {
  const folders = [
    { id: "a", parentId: null, slug: "a", title: "A", description: null, sortOrder: 0 },
    { id: "b", parentId: "a", slug: "b", title: "B", description: null, sortOrder: 0 },
    { id: "c", parentId: "b", slug: "c", title: "C", description: null, sortOrder: 0 },
  ];

  it("refuses moving a folder under its own child", () => {
    expect(wouldCreateCycle(folders, "a", "b")).toBe(true);
  });

  it("refuses moving a folder under its own grandchild", () => {
    // A check comparing only against DIRECT children would pass this
    // wrongly, which is why the real reachability walk is used.
    expect(wouldCreateCycle(folders, "a", "c")).toBe(true);
  });

  it("refuses moving a folder under itself", () => {
    expect(wouldCreateCycle(folders, "b", "b")).toBe(true);
  });

  it("allows moving a folder to the root", () => {
    expect(wouldCreateCycle(folders, "c", null)).toBe(false);
  });

  it("allows a move that does not close a loop", () => {
    expect(wouldCreateCycle(folders, "c", "a")).toBe(false);
  });

  it("does not mutate the caller's array", () => {
    // It applies the move to a copy before asking findCycle. Mutating
    // the input would leave the admin UI showing a move that was refused.
    const before = structuredClone(folders);
    wouldCreateCycle(folders, "a", "c");
    expect(folders).toEqual(before);
  });
});
