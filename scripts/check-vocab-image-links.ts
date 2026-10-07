/**
 * Every VOCAB_IMAGES URL must answer 200 (or 206 to a ranged GET) with an image content type.
 * Exit 1 on any failure, or on an empty list.
 *   bun scripts/check-vocab-image-links.ts [--extra-url <url> ...]   (--extra-url: mutation-sanity hook)
 */
import { VOCAB_IMAGES } from "../src/data/vocab-images";
import { checkAll, summarize } from "../src/lib/vocab-images/link-check";

const extra = process.argv.flatMap((a, i, all) =>
  a === "--extra-url" && all[i + 1] ? [all[i + 1]] : [],
);
const urls = [...new Set([...Object.values(VOCAB_IMAGES).map((img) => img.url), ...extra])];
if (urls.length === 0) {
  console.error("No vocab image URLs: a link check over nothing proves nothing.");
  process.exit(1);
}
const { ok, failed } = summarize(await checkAll(urls, { concurrency: 8 }));
console.log(`${ok}/${urls.length} vocab image URLs returned an image.`);
for (const f of failed.slice(0, 50))
  console.log(`FAIL ${f.status ?? "network"} ${f.method} ${f.url} (${f.detail})`);
process.exit(failed.length === 0 ? 0 : 1);
