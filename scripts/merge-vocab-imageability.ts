/**
 * Vocab image: merges classifier-subagent results into scripts/vocab-imageability.json.
 *   bun scripts/merge-vocab-imageability.ts scripts/vocab-images/work/imageability/fr-01.result.json [...]
 * Each <id>.result.json is checked against its <id>.json batch. Any problem -> nothing written, exit 1.
 */
import fs from "node:fs";
import path from "node:path";
import { IMAGEABILITY_DATA, type ImageabilityData } from "../src/lib/vocab-images/imageability";
import {
  mergeClassification,
  type CandidateBatch,
  type ClassificationResult,
} from "../src/lib/vocab-images/imageability-merge";

const TARGET = path.resolve(import.meta.dirname, "vocab-imageability.json");
let data: ImageabilityData = structuredClone(IMAGEABILITY_DATA);
const problems: string[] = [];
for (const file of process.argv.slice(2)) {
  const result = JSON.parse(fs.readFileSync(file, "utf8")) as ClassificationResult;
  const batch = JSON.parse(
    fs.readFileSync(file.replace(/\.result\.json$/, ".json"), "utf8"),
  ) as CandidateBatch;
  const merged = mergeClassification(data, batch, result);
  problems.push(...merged.problems);
  data = merged.data;
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(TARGET, "utf8")) as { $comment: string };
fs.writeFileSync(TARGET, JSON.stringify({ $comment: raw.$comment, ...data }, null, 2) + "\n");
console.log(`merged ${process.argv.length - 2} result file(s) into ${TARGET}`);
