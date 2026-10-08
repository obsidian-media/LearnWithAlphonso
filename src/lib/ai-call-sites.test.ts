import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every NVIDIA request goes through one of two chokepoints, which always add SAFETY_PREAMBLE. A new call site that
 * fetches the URL itself fails here, so it cannot skip the safety rules. scripts/ is out of scope: those are offline
 * authoring tools with a human reviewing the output.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const SCAN = ["src", "supabase/functions", "admin"];
const CHOKEPOINTS = ["src/lib/nvidia-chat.server.ts", "supabase/functions/_shared/nvidia-chat.ts"];
const NVIDIA = /https:\/\/integrate\.api\.nvidia\.com/;

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
  });
}
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");

describe("NVIDIA call sites", () => {
  const files = SCAN.flatMap((d) => walk(path.join(ROOT, d)));

  it("only the two chokepoints call NVIDIA directly", () => {
    const callers = files
      .filter((f) => NVIDIA.test(fs.readFileSync(f, "utf8")))
      .map(rel)
      .sort();
    expect(callers).toEqual([...CHOKEPOINTS].sort());
    // Walks three source trees: allow for a slow disk or a loaded CI runner.
  }, 30_000);

  it("each chokepoint applies the safety preamble to the messages it sends", () => {
    for (const f of CHOKEPOINTS) {
      expect(fs.readFileSync(path.join(ROOT, f), "utf8"), f).toMatch(
        /messages:\s*applySafety\(body\.messages\)/,
      );
    }
  });
});
