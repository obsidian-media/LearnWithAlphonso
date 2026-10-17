/**
 * CI check: the built web bundle must not contain Lefff lexicon data (the
 * french-verbs-lefff dev dependency, 6 MB of LGPL-LR data). Run after
 * `bun run build`. Fails if no build output exists, so it cannot pass by
 * looking at nothing.
 *
 *   bun scripts/check-no-lefff-in-bundle.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { LEFFF_MARKERS, LEFFF_ROW_LIMIT, LEFFF_ROW_SHAPE } from "../src/data/generative/lefff-markers";

const OUTPUT_DIRS = [".output", "dist", ".vercel/output"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const dirs = OUTPUT_DIRS.filter((d) => existsSync(d));
if (dirs.length === 0) {
  console.error(`No build output found (looked for ${OUTPUT_DIRS.join(", ")}). Run "bun run build" first.`);
  process.exit(1);
}

const offenders: string[] = [];
let scanned = 0;
for (const dir of dirs)
  for (const file of walk(dir)) {
    if (!/\.(js|mjs|cjs|json|html|css|map)$/.test(file)) continue;
    scanned++;
    const text = readFileSync(file, "utf8");
    if (LEFFF_MARKERS.some((m) => text.includes(m))) offenders.push(`${file} (marker)`);
    else if ((text.match(LEFFF_ROW_SHAPE) ?? []).length > LEFFF_ROW_LIMIT) offenders.push(`${file} (rows)`);
  }

if (scanned === 0) {
  console.error("Build output exists but contained no scannable files.");
  process.exit(1);
}
if (offenders.length > 0) {
  console.error("Lefff lexicon data found in the build output:\n  " + offenders.join("\n  "));
  process.exit(1);
}
console.log(`No Lefff data in ${scanned} built files.`);
