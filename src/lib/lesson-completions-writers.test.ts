import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * lesson_completions feeds XP-paying features (weekly challenges, team missions). Its rows must only come from a
 * lesson actually completed, i.e. completeLessonRemote (and the complete-lesson Edge Function, which is Deno code
 * outside src/). Both now use the service-role-only apply_lesson_completion transaction. A second writer is how the removed mergeGuestProgress endpoint let any signed-in user insert up to
 * 500 fake completions and farm those rewards. This fails the build if another web server function starts writing
 * the table.
 */
const SRC = path.resolve(import.meta.dirname, "..");
const ALLOWED = new Set(["lib/sync.functions.ts"]);
const WRITE = /\.from\(\s*["']lesson_completions["']\s*\)\s*\.(insert|update|upsert|delete)\b/g;
const RPC_WRITE = /\.rpc\(\s*["']apply_lesson_completion["']/g;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}

describe("only completeLessonRemote writes lesson_completions", () => {
  const writers = sourceFiles(SRC).flatMap((file) => {
    const body = fs.readFileSync(file, "utf8");
    const hits = [...body.matchAll(WRITE), ...body.matchAll(RPC_WRITE)];
    return hits.length > 0 ? [path.relative(SRC, file).split(path.sep).join("/")] : [];
  });

  it("finds the legitimate writer (the scan is not vacuous)", () => {
    expect(writers).toContain("lib/sync.functions.ts");
  });

  it("no other source file writes the table", () => {
    expect(writers.filter((file) => !ALLOWED.has(file))).toEqual([]);
  });

  it("completeLessonRemote is the only write in its file", () => {
    const source = fs.readFileSync(path.join(SRC, "lib/sync.functions.ts"), "utf8");
    expect([...source.matchAll(WRITE)]).toHaveLength(0);
    expect([...source.matchAll(RPC_WRITE)]).toHaveLength(1);
  });
});
