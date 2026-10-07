import type { VocabImageRow } from "../curriculum-seed";

/** PostgREST's default max rows per request. */
export const PAGE_SIZE = 1000;
export const MIN_ROWS = 100;

export function planVocabImageSync(
  existing: { terms: string[]; total: number },
  rows: VocabImageRow[],
): { upserts: VocabImageRow[]; deletes: string[] } {
  if (rows.length < MIN_ROWS) {
    throw new Error(
      `refusing to sync ${rows.length} rows: fewer than ${MIN_ROWS} would gut vocab_images`,
    );
  }
  if (existing.terms.length !== existing.total) {
    throw new Error(
      `saw ${existing.terms.length} of ${existing.total} existing rows: paginate before syncing`,
    );
  }
  const keep = new Set(rows.map((r) => r.term));
  return { upserts: rows, deletes: existing.terms.filter((t) => !keep.has(t)).sort() };
}
