import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Wiring guards for edge functions whose index.ts cannot be imported (Deno.serve at module scope).
 * The decisions themselves are unit-tested in supabase/functions/_shared/hearts.test.ts and
 * complete-lesson/lesson-version.test.ts; these pin that index.ts actually uses them.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

describe("start-lesson-session hearts gate", () => {
  const src = read("supabase/functions/start-lesson-session/index.ts");
  it("imports the shared gate, not a local copy", () => {
    expect(src).toMatch(/from "\.\.\/_shared\/hearts\.ts"/);
    expect(src).not.toMatch(/function resolveHeartsRefill/);
  });
  it("checks the flag, reads hearts and returns the 409 body", () => {
    expect(src).toContain("heartsGateEnforced()");
    expect(src).toMatch(/heartsGate\(\s*state\.hearts,\s*state\.heartsRefillAt,\s*Date\.now\(\)\s*\)/);
    expect(src).toMatch(/jsonResponse\(outOfHeartsBody\(gate\.refillAt\),\s*409\)/);
  });
  it("gates before issuing a token", () => {
    expect(src.indexOf("heartsGate(")).toBeGreaterThan(0);
    expect(src.indexOf("heartsGate(")).toBeLessThan(src.indexOf("issueLessonSessionToken({"));
  });
});

describe("complete-lesson version mismatch", () => {
  const src = read("supabase/functions/complete-lesson/index.ts");
  it("returns 409 lesson-version-mismatch and no longer 400s a mismatched payload", () => {
    expect(src).toMatch(/lessonPayloadMatches\(found, total, answers\)/);
    expect(src).toMatch(/jsonResponse\(\{ error: "lesson-version-mismatch" \}, 409\)/);
    expect(src).not.toContain("Invalid lesson completion payload");
  });
  it("still passes account consent to the grader", () => {
    expect(src).toMatch(/deriveAnswerCorrectness\([^)]*, ai\)/);
  });
});
