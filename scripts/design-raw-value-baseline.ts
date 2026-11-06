/**
 * Ratchets design/baselines/<platform>.json down to today's raw-value counts (see src/lib/raw-design-values.ts).
 * It only ever lowers a count: a file that got worse, or a new file with raw values, is reported and left alone,
 * because the fix is to use tokens, not to raise the baseline. Run it after removing raw values so the guard
 * holds the gain.
 *
 * Usage: bun scripts/design-raw-value-baseline.ts          (lower every baseline to today's counts)
 *        bun scripts/design-raw-value-baseline.ts --init   (write today's counts as-is; used once, to start)
 */
import fs from "node:fs";
import path from "node:path";
import {
  baselinePath,
  scanPlatform,
  type Baseline,
  type Platform,
} from "../src/lib/raw-design-values";

const root = path.resolve(import.meta.dirname, "..");
const init = process.argv.includes("--init");
const COMMENT =
  "Raw colours and font sizes per file in view code, today. A count may only go down: lower it with bun scripts/design-raw-value-baseline.ts. Never raise one; use the design tokens instead.";

let refused = 0;
for (const platform of ["web", "ios", "android"] as Platform[]) {
  const current = scanPlatform(root, platform);
  const file = baselinePath(root, platform);
  const old: Baseline =
    init || !fs.existsSync(file) ? current : JSON.parse(fs.readFileSync(file, "utf8")).files;
  const next: Baseline = {};
  for (const [rel, count] of Object.entries(current)) {
    const allowed = old[rel] ?? 0;
    if (count > allowed) {
      console.error(
        `${platform}: ${rel} has ${count} raw value(s), baseline allows ${allowed}. Not raised.`,
      );
      refused++;
      if (allowed > 0) next[rel] = allowed;
    } else next[rel] = count;
  }
  const total = Object.values(next).reduce((a, b) => a + b, 0);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ $comment: COMMENT, total, files: next }, null, 2)}\n`);
  console.log(`${platform}: ${Object.keys(next).length} files, ${total} raw values`);
}
if (refused) process.exitCode = 1;
