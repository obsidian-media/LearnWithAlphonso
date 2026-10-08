/**
 * Vocab image plan stage: in-scope, imageable vocab terms -> scripts/vocab-images/work/manifest.json.
 * Keeps fetch/review progress for unchanged terms; drops terms no longer imageable.
 *   bun scripts/vocab-image-terms.ts
 */
import fs from "node:fs";
import path from "node:path";
import { planManifest, statusCounts } from "../src/lib/vocab-images/manifest";
import { planImageableTerms, vocabTermIndex } from "../src/lib/vocab-images/terms";
import { WORK_DIR, readManifest, writeManifest } from "./vocab-images/workdir";

const scope = new Set<string>(
  JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, "vocab-images/scope-keys.json"), "utf8"),
  ),
);
const { planned, skipped } = planImageableTerms(vocabTermIndex(), undefined, scope);
if (!planned.some((p) => p.key === "doctor")) {
  console.error(
    'curriculum.ts\'s only imageKey "doctor" is not planned; fix the classifier data first.',
  );
  process.exit(1);
}
const manifest = planManifest(readManifest(), planned);
writeManifest(manifest);
fs.writeFileSync(path.join(WORK_DIR, "skipped.json"), JSON.stringify(skipped, null, 2) + "\n");
console.log(
  `planned ${planned.length} imageable terms; skipped ${skipped.length} (work/skipped.json)`,
);
console.log(statusCounts(manifest));
