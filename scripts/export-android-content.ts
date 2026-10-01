/**
 * Writes the Android app's bundled content JSON.
 *
 * Same builders and same output shape as scripts/export-ios-content.ts; only
 * the destination differs. Deliberately a separate script (owner decision
 * 2026-09-29: the Android pipeline stays independent of the iOS one).
 *
 * Usage: bun scripts/export-android-content.ts
 * .github/workflows/android-ci.yml regenerates and fails on any diff.
 */
import fs from "node:fs";
import path from "node:path";
import {
  buildIOSContentBundle,
  buildIOSScenariosBundle,
  buildIOSCampaignsBundle,
  buildIOSAchievementsBundle,
  buildIOSVocabImagesBundle,
  buildIOSPlacementBundle,
} from "../src/lib/ios-content-export";

const OUT_DIR = path.resolve(
  import.meta.dirname,
  "../android/LearnWithAlphonso/app/src/main/assets/content",
);

function writeJSON(filename: string, data: unknown) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`Wrote ${outPath}`);
}

writeJSON("curriculum-en.json", buildIOSContentBundle("en"));
writeJSON("curriculum-fr.json", buildIOSContentBundle("fr"));
writeJSON("curriculum-es.json", buildIOSContentBundle("es"));
writeJSON("scenarios.json", buildIOSScenariosBundle());
writeJSON("campaigns.json", buildIOSCampaignsBundle());
writeJSON("achievements.json", buildIOSAchievementsBundle());
writeJSON("vocab-images.json", buildIOSVocabImagesBundle());
writeJSON("placement-en.json", buildIOSPlacementBundle("en"));
writeJSON("placement-fr.json", buildIOSPlacementBundle("fr"));
writeJSON("placement-es.json", buildIOSPlacementBundle("es"));
