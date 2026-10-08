import { parseVocabImageUrl } from "./url-policy";
import type { VocabImageRecord } from "./types";

/** A keep-set smaller than this means the data or manifest is missing or wrong, never a real prune. */
export const MIN_KEEP = 100;
/** More than this share of the bucket going away needs --force-large. */
export const MAX_STALE_SHARE = 0.1;

/** Object paths (`<lang>/<slug>.jpg`) referenced by the committed image data. */
export function keepPathsFromImages(images: Record<string, VocabImageRecord>): Set<string> {
  const keep = new Set<string>();
  for (const img of Object.values(images)) {
    const parsed = parseVocabImageUrl(img.url);
    if (parsed) keep.add(`${parsed.lang}/${parsed.slug}.jpg`);
  }
  return keep;
}

/**
 * Objects that no committed image references. Refuses when the keep-set looks
 * wrong (empty or tiny) or when it would delete a large share of the bucket.
 */
export function planPrune(
  listed: string[],
  keep: ReadonlySet<string>,
  { forceLarge = false }: { forceLarge?: boolean } = {},
): string[] {
  if (keep.size < MIN_KEEP) {
    throw new Error(
      `refusing to prune: only ${keep.size} referenced object(s), fewer than ${MIN_KEEP}`,
    );
  }
  const stale = listed.filter((p) => !keep.has(p));
  if (!forceLarge && stale.length > listed.length * MAX_STALE_SHARE) {
    throw new Error(
      `refusing to prune ${stale.length} of ${listed.length} objects (over ${MAX_STALE_SHARE * 100}%); pass --force-large if intended`,
    );
  }
  return stale;
}
