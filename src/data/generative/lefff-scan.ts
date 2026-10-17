import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { findLefffLeak } from "./lefff-markers";

/** Where a web build may write its output. */
export const BUILD_OUTPUT_DIRS = [".output", "dist", ".vercel/output"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export type ScanResult =
  | { ok: true; scanned: number }
  | { ok: false; reason: "no-output" | "nothing-scanned" | "leak"; offenders: string[] };

/**
 * Scans a build's output for Lefff lexicon data. Fails when there is no build
 * output, or no scannable file in it, so it cannot pass by looking at nothing.
 */
export function scanBuildOutput(cwd: string, dirs: string[] = BUILD_OUTPUT_DIRS): ScanResult {
  const present = dirs.map((d) => path.join(cwd, d)).filter((d) => existsSync(d));
  if (present.length === 0) return { ok: false, reason: "no-output", offenders: [] };
  const offenders: string[] = [];
  let scanned = 0;
  for (const dir of present)
    for (const file of walk(dir)) {
      if (!/\.(js|mjs|cjs|json|html|css|map)$/.test(file)) continue;
      scanned++;
      const leak = findLefffLeak(readFileSync(file, "utf8"));
      if (leak) offenders.push(`${path.relative(cwd, file)} (${leak})`);
    }
  if (scanned === 0) return { ok: false, reason: "nothing-scanned", offenders };
  if (offenders.length > 0) return { ok: false, reason: "leak", offenders };
  return { ok: true, scanned };
}
