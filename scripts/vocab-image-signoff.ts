/**
 * Records the owner's sign-off of the CURRENT src/data/vocab-images.ts.
 * Run ONLY after Shayan Salimi has approved the owner sheet in his own message.
 * Never on an agent's say-so.
 *   bun scripts/vocab-image-signoff.ts --by "Shayan Salimi"
 */
import fs from "node:fs";
import { VOCAB_IMAGES } from "../src/data/vocab-images";
import { buildSignoff } from "../src/lib/vocab-images/signoff";
import { SIGNOFF_PATH } from "./vocab-images/workdir";

const at = process.argv.indexOf("--by");
const signoff = buildSignoff(
  VOCAB_IMAGES,
  at > -1 ? process.argv[at + 1] : "",
  new Date().toISOString().slice(0, 10),
);
fs.writeFileSync(SIGNOFF_PATH, JSON.stringify(signoff, null, 2) + "\n");
console.log(`signed off ${signoff.entryCount} images, digest ${signoff.digest.slice(0, 12)}`);
