/**
 * Batch-fetches vocab-card images from the Pexels API for a list of terms.
 *
 * Usage:
 *   PEXELS_API_KEY=... node_modules/.bin/tsx scripts/fetch-vocab-images.ts <terms-file.json> [out-file.json]
 *
 * <terms-file.json> is either a flat array of terms, e.g. ["apple", "chair"],
 * or an array of [term, searchQueryOverride] pairs when the term itself is a
 * bad search query (e.g. ["rare", "rare steak medium"] for the "rare" vocab
 * term, which alone would search for gemstones rather than food).
 *
 * Writes { [term]: { url, alt, credit } } to out-file.json (default
 * vocab-images-batch.json next to this script) for manual spot-checking
 * before merging into src/data/vocab-images.ts by hand — this script
 * fetches candidates, it does not commit them. Pexels' search relevance
 * isn't perfect (confirmed mismatches in earlier manual batches, e.g.
 * "trainers" returning gym equipment instead of sneakers), so always
 * review the alt text of a sample before shipping a batch.
 *
 * Only feed this concrete, photographable terms (nouns) — abstract words
 * and function words don't get meaningful stock photos regardless of
 * fetch volume, per TASK-088's design note.
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
if (!PEXELS_API_KEY) {
  console.error("Set PEXELS_API_KEY in the environment before running this script.");
  process.exit(1);
}

const [, , termsFile, outFileArg] = process.argv;
if (!termsFile) {
  console.error("Usage: tsx scripts/fetch-vocab-images.ts <terms-file.json> [out-file.json]");
  process.exit(1);
}
const outFile = outFileArg ?? "scripts/vocab-images-batch.json";

type TermEntry = string | [string, string];

async function main() {
  const fs = await import("node:fs/promises");
  const raw = JSON.parse(await fs.readFile(termsFile, "utf-8")) as TermEntry[];

  const results: Record<string, { url: string; alt: string; credit: string }> = {};
  const errors: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i]!;
    const [term, query] = Array.isArray(entry) ? entry : [entry, entry];
    const url =
      "https://api.pexels.com/v1/search?" +
      new URLSearchParams({ query, per_page: "1", orientation: "landscape" }).toString();

    try {
      // Pexels' edge (Cloudflare) blocks requests with no browser-like
      // User-Agent — plain fetch() with default headers works, but Node's
      // undici default UA has been flaky against it before; set one
      // explicitly to be safe.
      const res = await fetch(url, {
        headers: {
          Authorization: PEXELS_API_KEY!,
          "User-Agent": "Mozilla/5.0 (compatible; AlphonsoVocabImageFetcher/1.0)",
        },
      });
      if (!res.ok) {
        errors.push(`${term}: HTTP ${res.status}`);
        continue;
      }
      const data = (await res.json()) as {
        photos: { src: { large: string }; alt: string | null; photographer: string }[];
      };
      const photo = data.photos[0];
      if (!photo) {
        errors.push(`${term}: no results for query "${query}"`);
        continue;
      }
      results[term] = {
        url: photo.src.large.split("?")[0] + "?auto=compress&cs=tinysrgb&h=350",
        alt: (photo.alt ?? term).trim() || term,
        credit: photo.photographer,
      };
    } catch (e) {
      errors.push(`${term}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if ((i + 1) % 25 === 0) console.log(`${i + 1}/${raw.length} done`);
    // Free-tier Pexels rate limit is generous but not instant; be polite.
    await new Promise((r) => setTimeout(r, 120));
  }

  await fs.writeFile(outFile, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\nFetched ${Object.keys(results).length}/${raw.length} -> ${outFile}`);
  if (errors.length) {
    console.log(`\n${errors.length} errors:`);
    for (const e of errors) console.log(" -", e);
  }
}

void main();
