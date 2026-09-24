/**
 * Writes the committed id baseline the phase 1 audit is checked against.
 * Run ONCE before any content edits; never re-run to "fix" a failing
 * parity check -- a failure means real users' review items would be
 * repointed (see the design doc's id-stability constraint).
 *
 * Usage: bun run scripts/snapshot-english-ids.ts
 */
import fs from "node:fs";
import path from "node:path";
import { collectEnglishIds } from "../src/lib/english-id-parity";

const outDir = path.resolve(import.meta.dirname, "../.audit-baseline");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "english-ids.json");
const ids = collectEnglishIds();
fs.writeFileSync(out, JSON.stringify(ids, null, 2));
console.log(`Wrote ${out} (${ids.length} ids)`);
