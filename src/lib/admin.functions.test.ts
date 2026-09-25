import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  ADMIN_FUNCTION_NAMES,
  wouldCreateCycle,
  affectedOrThrow,
  cycleFor,
} from "./admin.functions";
import { normalizeTranscript } from "./podcast-transcript";

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
  const rawSource = readFileSync("src/lib/admin.functions.ts", "utf8");
  // Comments are stripped before counting. The file DISCUSSES
  // `.middleware([requireAdmin])` in its own header prose, so a
  // count over raw text could be satisfied by a comment while a real
  // gate was missing -- the guard would pass at the moment it mattered.
  const source = rawSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

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

  it("defines no admin server function outside this file", () => {
    // The counts above are only meaningful because every admin function
    // is supposed to live in admin.functions.ts -- and until this test,
    // nothing enforced that. A later `src/lib/admin-tags.functions.ts`
    // exporting an ungated `adminCreateTag` would leave all four other
    // assertions green while any authenticated learner could write to
    // the library. That is exactly the failure this suite exists for.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
        if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) continue;
        if (full.endsWith(path.join("lib", "admin.functions.ts"))) continue;
        const body = readFileSync(full, "utf8");
        if (/^export const admin[A-Z]\w*\s*=\s*createServerFn/m.test(body)) offenders.push(full);
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
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

// A PostgREST `.update()/.delete().eq()` that matches no row succeeds
// with no error and zero rows touched. Every admin mutation returned
// `{ ok: true }` for that, so an admin who deleted a folder someone else
// had already removed, or renamed an episode from a stale tab, was told
// it worked. That is this repo's recurring defect in its plainest form:
// a success reported by code that never checked whether anything
// happened.
describe("affectedOrThrow", () => {
  it("passes through a result that touched a row", () => {
    expect(() => affectedOrThrow({ count: 1, error: null }, "nope")).not.toThrow();
  });

  it("throws the caller's message when nothing matched", () => {
    expect(() => affectedOrThrow({ count: 0, error: null }, "That folder is gone.")).toThrow(
      "That folder is gone.",
    );
  });

  it("prefers the database's own error when there is one", () => {
    // A real failure must not be reported as "nothing matched" -- that
    // would send someone hunting for a missing row when the actual
    // problem was a constraint or a connection.
    expect(() => affectedOrThrow({ count: null, error: { message: "boom" } }, "gone")).toThrow(
      "boom",
    );
  });

  it("treats a null count as nothing matched", () => {
    // PostgREST omits the count unless it is asked for. Treating
    // "unknown" as success is what produced the silent no-op; the
    // callers all ask for it, and if one ever stops, this fails loudly
    // rather than lying.
    expect(() => affectedOrThrow({ count: null, error: null }, "gone")).toThrow("gone");
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

  it("returns the offending path, so the refusal can name it", () => {
    // findCycle has always returned this and the caller discarded it.
    // "That would put the folder inside itself" leaves the admin to work
    // out WHICH nesting in a tree they cannot see all of at once.
    const cycle = cycleFor(folders, "a", "c");
    expect(cycle).not.toBeNull();
    expect(cycle).toEqual(expect.arrayContaining(["a", "b", "c"]));
  });

  it("names the folder itself when it is parented to itself", () => {
    expect(cycleFor(folders, "b", "b")).toEqual(["b"]);
  });

  it("returns null for a legal move", () => {
    expect(cycleFor(folders, "c", "a")).toBeNull();
  });
});

// Review Focus #5. In the CLI the TTS script and the transcript are two
// separate files typed on two separate runs. In the admin UI both are
// on one screen, so pasting the script into the transcript box is one
// wrong click -- and SSML rendered as a transcript reaches exactly the
// deaf and hard-of-hearing readers the feature exists for.
//
// This is a CHARACTERISATION test, not a red-green cycle: it asserts the
// admin path uses the SAME rule as --transcript rather than a second,
// looser one. Its job is to fail LATER, if anyone gives the admin path
// its own transcript rule.
describe("the admin transcript rule is the CLI's rule", () => {
  it("rejects ElevenLabs SSML by throwing, not by returning null", () => {
    // The plan wrote `toBeNull()` here. The real contract THROWS, and the
    // difference matters: null means "empty" and is a normal outcome the
    // caller stores nothing for, while a throw carries a message written
    // to be read. A server function that treated markup as null would
    // save an empty transcript and report success.
    expect(() => normalizeTranscript('<speak>Hello <break time="1s"/> there</speak>')).toThrow(
      /markup/i,
    );
  });

  it("rejects a bare self-closing tag", () => {
    expect(() => normalizeTranscript('Hello <break time="500ms"/> there')).toThrow(/markup/i);
  });

  it("accepts prose containing a less-than sign", () => {
    // "5 < 10" and "I <3 coffee" are ordinary transcript content; a rule
    // that rejects them rejects real episodes.
    expect(normalizeTranscript("Five is less than ten: 5 < 10.")).not.toBeNull();
    expect(normalizeTranscript("I <3 coffee.")).not.toBeNull();
  });

  it("rejects an empty transcript", () => {
    expect(normalizeTranscript("   \n\n  ")).toBeNull();
  });

  it("is the same function admin.functions.ts imports", () => {
    // The assertions above would all pass against a private copy of the
    // rule living in this test file. This pins the import, which is the
    // thing that actually stops the two paths drifting.
    expect(readFileSync("src/lib/admin.functions.ts", "utf8")).toContain(
      'from "./podcast-transcript"',
    );
  });
});
