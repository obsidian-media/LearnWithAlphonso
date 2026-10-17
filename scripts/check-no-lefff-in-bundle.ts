/**
 * CI check: the built web bundle must not contain Lefff lexicon data (the
 * french-verbs-lefff dev dependency, 6 MB of LGPL-LR data). Run after
 * `bun run build`. Fails if no build output exists, so it cannot pass by
 * looking at nothing. The detection logic and its fixtures are tested in
 * src/data/generative/lefff-markers.test.ts.
 *
 *   bun scripts/check-no-lefff-in-bundle.ts
 */
import { BUILD_OUTPUT_DIRS, scanBuildOutput } from "../src/data/generative/lefff-scan";

const result = scanBuildOutput(process.cwd());
if (result.ok) {
  console.log(`No Lefff data in ${result.scanned} built files.`);
} else if (result.reason === "no-output") {
  console.error(
    `No build output found (looked for ${BUILD_OUTPUT_DIRS.join(", ")}). Run "bun run build" first.`,
  );
  process.exit(1);
} else if (result.reason === "nothing-scanned") {
  console.error("Build output exists but contained no scannable files.");
  process.exit(1);
} else {
  console.error(
    "Lefff lexicon data found in the build output:\n  " + result.offenders.join("\n  "),
  );
  process.exit(1);
}
