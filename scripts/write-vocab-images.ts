/**
 * Vocab image render stage: manifest (uploaded entries) -> src/data/vocab-images.ts, prettier-formatted.
 * Refuses while any entry is unsettled or still awaits its second pass.
 *   bun scripts/write-vocab-images.ts                  # after the upload has run
 *   bun scripts/write-vocab-images.ts --planned-urls   # before it: approved entries get the url the upload will record
 *
 * Images already published in src/data/vocab-images.ts that the manifest does not mention are kept
 * as they are, so a later pass that plans only the new terms never drops the earlier ones.
 */
import fs from "node:fs";
import path from "node:path";
import * as prettier from "prettier";
import { statusCounts, toVocabImages, withPlannedUrls } from "../src/lib/vocab-images/manifest";
import { renderVocabImagesModule } from "../src/lib/vocab-images/render";
import {
  SECOND_PASS_RATE,
  SECOND_PASS_SEED,
  secondPassEntries,
} from "../src/lib/vocab-images/review";
import { VOCAB_IMAGES } from "../src/data/vocab-images";
import { readManifest } from "./vocab-images/workdir";

const TARGET = path.resolve(import.meta.dirname, "../src/data/vocab-images.ts");
const planned = process.argv.includes("--planned-urls");
const manifest = planned ? withPlannedUrls(readManifest()) : readManifest();
const counts = statusCounts(manifest);
const awaitingSecond = secondPassEntries(manifest, SECOND_PASS_RATE, SECOND_PASS_SEED).length;
if (counts["pending-fetch"] + counts.fetched + counts.approved > 0 || awaitingSecond > 0) {
  console.error(`Not settled: ${JSON.stringify(counts)}, awaiting second pass: ${awaitingSecond}.`);
  process.exit(1);
}
// A key the manifest knows about is taken from the manifest (a replaced or removed photo); every other key is kept.
const images = {
  ...Object.fromEntries(Object.entries(VOCAB_IMAGES).filter(([key]) => !(key in manifest.entries))),
  ...toVocabImages(manifest),
};
const config = (await prettier.resolveConfig(TARGET)) ?? {};
fs.writeFileSync(
  TARGET,
  await prettier.format(renderVocabImagesModule(images), { ...config, filepath: TARGET }),
);
console.log(
  `wrote ${Object.keys(images).length} images to ${TARGET}; ${counts["no-image"]} terms have no image`,
);
