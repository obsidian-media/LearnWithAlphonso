/**
 * Writes the native iOS app's bundled content JSON to both places that
 * need it: the app target (ios/LearnWithAlphonso/Resources/) and the
 * LearnWithAlphonsoKit Swift package (which declares these as `.copy()`
 * resources in Package.swift and loads them at runtime via Bundle.module
 * -- ContentStore and its tests depend on that copy specifically). Both
 * are written from the same generated payload in one pass so they can't
 * drift from each other. Re-run this whenever curriculum.ts,
 * curriculum-fr.ts, or scenarios.ts change -- the native app has no other
 * way to pick up content changes short of a new build (see the native
 * app's design doc, docs/superpowers/specs/2026-09-17-native-ios-app-design.md,
 * for why content is bundled rather than fetched at runtime for V1).
 *
 * Usage: node_modules/.bin/tsx scripts/export-ios-content.ts
 */
import fs from "node:fs";
import path from "node:path";
import { buildIOSContentBundle, buildIOSScenariosBundle } from "../src/lib/ios-content-export";

const OUT_DIRS = [
  path.resolve(import.meta.dirname, "../ios/LearnWithAlphonso/Resources"),
  path.resolve(
    import.meta.dirname,
    "../ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources",
  ),
];

function writeJSON(filename: string, data: unknown) {
  const json = JSON.stringify(data, null, 2);
  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, filename);
    fs.writeFileSync(outPath, json);
    console.log(`Wrote ${outPath}`);
  }
}

writeJSON("curriculum-en.json", buildIOSContentBundle("en"));
writeJSON("curriculum-fr.json", buildIOSContentBundle("fr"));
writeJSON("scenarios.json", buildIOSScenariosBundle());
