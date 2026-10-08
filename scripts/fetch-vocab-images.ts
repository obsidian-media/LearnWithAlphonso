/**
 * Vocab image fetch stage. For every manifest entry in "pending-fetch": search Pexels,
 * then Pixabay (safe search); pick the first clean, big-enough, not-rejected
 * photo; download it ONCE; resize to 700px JPEG without metadata; stage it in
 * scripts/vocab-images/work/staging/<lang>/<slug>-<sha8>.jpg. Never uploads,
 * never stores a provider download URL (Pixabay /get/ links expire in 24h).
 *
 *   set -a; source <main checkout>/.env; set +a      # PEXELS_API_KEY / PIXABAY_API_KEY, never printed
 *   bun scripts/fetch-vocab-images.ts [--limit N]
 *
 * Resumable: progress is saved every 10 terms; re-run after a rate limit.
 */
import fs from "node:fs";
import path from "node:path";
import { recordFetchResult, statusCounts } from "../src/lib/vocab-images/manifest";
import { sha8Of } from "../src/lib/vocab-images/paths";
import {
  candidateFrom,
  parsePexels,
  parsePixabay,
  pexelsSearchUrl,
  pickPhoto,
  pixabaySearchUrl,
  type ProviderPhoto,
} from "../src/lib/vocab-images/providers";
import { redactKeys } from "../src/lib/vocab-images/redact";
import { resizeToJpeg } from "../src/lib/vocab-images/resize";
import { WORK_DIR, readManifest, readRejected, writeManifest } from "./vocab-images/workdir";

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;
const SECRETS = [PEXELS_API_KEY, PIXABAY_API_KEY];
const UA = "Mozilla/5.0 (compatible; AlphonsoVocabImageFetcher/2.0)";
if (!PEXELS_API_KEY && !PIXABAY_API_KEY) {
  console.error("Set PEXELS_API_KEY and/or PIXABAY_API_KEY (values are never printed).");
  process.exit(1);
}
const limitAt = process.argv.indexOf("--limit");
const LIMIT = limitAt > -1 ? Number(process.argv[limitAt + 1]) : Number.POSITIVE_INFINITY;

class RateLimited extends Error {}
type Provider = "pexels" | "pixabay";

async function search(provider: Provider, query: string): Promise<ProviderPhoto[]> {
  const res =
    provider === "pexels"
      ? await fetch(pexelsSearchUrl(query), {
          headers: { Authorization: PEXELS_API_KEY!, "User-Agent": UA },
        })
      : await fetch(pixabaySearchUrl(query, PIXABAY_API_KEY!), { headers: { "User-Agent": UA } });
  if (res.status === 429) throw new RateLimited(provider);
  if (!res.ok) throw new Error(`${provider} search returned ${res.status}`);
  const json: unknown = await res.json();
  return provider === "pexels" ? parsePexels(json) : parsePixabay(json);
}

async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download returned ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function main() {
  const manifest = readManifest();
  const banned = new Set(Object.keys(readRejected()));
  const off: Record<Provider, boolean> = { pexels: !PEXELS_API_KEY, pixabay: !PIXABAY_API_KEY };
  const pending = Object.values(manifest.entries)
    .filter((e) => e.status === "pending-fetch")
    .slice(0, LIMIT);
  let done = 0;

  for (const entry of pending) {
    if (off.pexels && off.pixabay) {
      console.log("Both providers are rate-limited. Progress saved; re-run later.");
      break;
    }
    const excluded = new Set([...banned, ...entry.rejectedSourceIds]);
    let photo: ProviderPhoto | null = null;
    let searchedAll = true;
    try {
      for (const provider of ["pexels", "pixabay"] as const) {
        if (photo) break;
        if (off[provider]) {
          searchedAll = false;
          continue;
        }
        try {
          photo = pickPhoto(await search(provider, entry.query), excluded);
        } catch (e) {
          if (!(e instanceof RateLimited)) throw e;
          off[provider] = true;
          searchedAll = false;
          console.log(`${provider} rate-limited; skipping it for the rest of this run.`);
        }
      }
      if (photo) {
        const resized = await resizeToJpeg(await download(photo.downloadUrl));
        const sha8 = sha8Of(resized.bytes);
        const rel = `staging/${entry.lang}/${entry.slug}-${sha8}.jpg`;
        fs.mkdirSync(path.join(WORK_DIR, "staging", entry.lang), { recursive: true });
        fs.writeFileSync(path.join(WORK_DIR, rel), resized.bytes);
        manifest.entries[entry.key] = recordFetchResult(
          entry,
          candidateFrom(photo, rel, sha8, resized.width, resized.height),
        );
      } else if (searchedAll) {
        manifest.entries[entry.key] = recordFetchResult(entry, null);
      }
    } catch (e) {
      console.log(
        `${entry.key}: ${redactKeys(e instanceof Error ? e.message : String(e), SECRETS)} (left pending)`,
      );
    }
    if (++done % 10 === 0) {
      writeManifest(manifest);
      console.log(`${done}/${pending.length}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  writeManifest(manifest);
  console.log(statusCounts(manifest));
}

main().catch((e) => {
  console.error(redactKeys(e instanceof Error ? (e.stack ?? e.message) : String(e), SECRETS));
  process.exit(1);
});
