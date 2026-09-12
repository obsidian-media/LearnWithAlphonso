/**
 * Batch-fetches vocab-card images for a list of terms, trying Pexels first
 * and falling back to Pixabay per-term on error or empty result (and for
 * the rest of the run once Pexels visibly rate-limits, since retrying a
 * limited provider per-term just wastes time).
 *
 * Usage:
 *   PEXELS_API_KEY=... PIXABAY_API_KEY=... node_modules/.bin/tsx scripts/fetch-vocab-images.ts <terms-file.json> [out-file.json]
 *
 * <terms-file.json> is either a flat array of terms, e.g. ["apple", "chair"],
 * or an array of [term, searchQueryOverride] pairs when the term itself is a
 * bad search query (e.g. ["rare", "rare steak medium"] for the "rare" vocab
 * term, which alone would search for gemstones rather than food).
 *
 * Writes { [term]: { url, alt, credit, source } } to out-file.json (default
 * vocab-images-batch.json next to this script) for manual spot-checking
 * before merging into src/data/vocab-images.ts by hand — this script
 * fetches candidates, it does not commit them. Search relevance isn't
 * perfect on either provider (confirmed mismatches in earlier batches,
 * e.g. "trainers" returning gym equipment instead of sneakers, "heroine"
 * matching drug paraphernalia), so always review the alt text of a sample
 * before shipping a batch.
 *
 * Only feed this concrete, photographable terms (nouns) — abstract words,
 * function words, and conjugated verb forms don't get meaningful stock
 * photos regardless of fetch volume, per TASK-088's design note.
 */

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;
if (!PEXELS_API_KEY && !PIXABAY_API_KEY) {
  console.error(
    "Set PEXELS_API_KEY and/or PIXABAY_API_KEY in the environment before running this script.",
  );
  process.exit(1);
}

const [, , termsFile, outFileArg] = process.argv;
if (!termsFile) {
  console.error("Usage: tsx scripts/fetch-vocab-images.ts <terms-file.json> [out-file.json]");
  process.exit(1);
}
const outFile = outFileArg ?? "scripts/vocab-images-batch.json";

type TermEntry = string | [string, string];
type ImageResult = { url: string; alt: string; credit: string; source: "pexels" | "pixabay" };

async function tryPexels(query: string): Promise<ImageResult | null> {
  if (!PEXELS_API_KEY) return null;
  const url =
    "https://api.pexels.com/v1/search?" +
    new URLSearchParams({ query, per_page: "1", orientation: "landscape" }).toString();
  // Pexels' edge (Cloudflare) blocks requests with no browser-like
  // User-Agent — plain fetch() with default headers works, but Node's
  // undici default UA has been flaky against it before; set one
  // explicitly to be safe.
  const res = await fetch(url, {
    headers: {
      Authorization: PEXELS_API_KEY,
      "User-Agent": "Mozilla/5.0 (compatible; AlphonsoVocabImageFetcher/1.0)",
    },
  });
  if (res.status === 429) throw new RateLimitError("pexels");
  if (!res.ok) return null;
  const data = (await res.json()) as {
    photos: { src: { large: string }; alt: string | null; photographer: string }[];
  };
  const photo = data.photos[0];
  if (!photo) return null;
  return {
    url: photo.src.large.split("?")[0] + "?auto=compress&cs=tinysrgb&h=350",
    alt: (photo.alt ?? query).trim() || query,
    credit: photo.photographer,
    source: "pexels",
  };
}

async function tryPixabay(query: string): Promise<ImageResult | null> {
  if (!PIXABAY_API_KEY) return null;
  const url =
    "https://pixabay.com/api/?" +
    new URLSearchParams({
      key: PIXABAY_API_KEY,
      q: query,
      image_type: "photo",
      orientation: "horizontal",
      safesearch: "true",
      per_page: "3",
    }).toString();
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AlphonsoVocabImageFetcher/1.0)" },
  });
  if (res.status === 429) throw new RateLimitError("pixabay");
  if (!res.ok) return null;
  const data = (await res.json()) as {
    hits: { webformatURL: string; tags: string; user: string }[];
  };
  const hit = data.hits[0];
  if (!hit) return null;
  return {
    url: hit.webformatURL,
    alt: hit.tags || query,
    credit: hit.user,
    source: "pixabay",
  };
}

class RateLimitError extends Error {
  constructor(public provider: "pexels" | "pixabay") {
    super(`${provider} rate limited`);
  }
}

async function main() {
  const fs = await import("node:fs/promises");
  const raw = JSON.parse(await fs.readFile(termsFile, "utf-8")) as TermEntry[];

  const results: Record<string, ImageResult> = {};
  const errors: string[] = [];
  let pexelsExhausted = !PEXELS_API_KEY;
  let pixabayExhausted = !PIXABAY_API_KEY;

  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i]!;
    const [term, query] = Array.isArray(entry) ? entry : [entry, entry];

    let found: ImageResult | null = null;
    try {
      if (!pexelsExhausted) {
        try {
          found = await tryPexels(query);
        } catch (e) {
          if (e instanceof RateLimitError) {
            pexelsExhausted = true;
            console.log(
              `[${i + 1}/${raw.length}] Pexels rate-limited, switching to Pixabay for the rest of this run.`,
            );
          } else throw e;
        }
      }
      if (!found && !pixabayExhausted) {
        try {
          found = await tryPixabay(query);
        } catch (e) {
          if (e instanceof RateLimitError) {
            pixabayExhausted = true;
            console.log(`[${i + 1}/${raw.length}] Pixabay rate-limited too.`);
          } else throw e;
        }
      }
      if (found) {
        results[term] = found;
      } else if (pexelsExhausted && pixabayExhausted) {
        errors.push(`${term}: both providers rate-limited, stopping`);
        break;
      } else {
        errors.push(`${term}: no results for query "${query}"`);
      }
    } catch (e) {
      errors.push(`${term}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if ((i + 1) % 25 === 0) console.log(`${i + 1}/${raw.length} done`);
    // Be polite to whichever provider is currently serving requests.
    await new Promise((r) => setTimeout(r, 120));
  }

  await fs.writeFile(outFile, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\nFetched ${Object.keys(results).length}/${raw.length} -> ${outFile}`);
  if (errors.length) {
    console.log(`\n${errors.length} errors/skips:`);
    for (const e of errors.slice(0, 30)) console.log(" -", e);
    if (errors.length > 30) console.log(`  ...and ${errors.length - 30} more`);
  }
}

void main();
