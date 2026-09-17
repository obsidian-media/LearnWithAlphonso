/**
 * Writes the native iOS app's bundled content JSON to
 * ios/LearnWithAlphonso/Resources/. Re-run this whenever curriculum.ts,
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

const OUT_DIR = path.resolve(import.meta.dirname, "../ios/LearnWithAlphonso/Resources");

function writeJSON(filename: string, data: unknown) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`Wrote ${outPath}`);
}

writeJSON("curriculum-en.json", buildIOSContentBundle("en"));
writeJSON("curriculum-fr.json", buildIOSContentBundle("fr"));
writeJSON("scenarios.json", buildIOSScenariosBundle());
