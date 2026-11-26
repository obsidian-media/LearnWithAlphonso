/**
 * Reads every row of a query that PostgREST would otherwise cut off at its row cap (`max-rows`, 1000 by default on
 * Supabase). A bare `.select()` that hits the cap returns the first rows and NO error, so a total or an accuracy
 * computed from it is silently wrong for exactly the heaviest learners.
 *
 * `page(from, to)` runs the same query with `.order(<unique column>).range(from, to)` and `{ count: "exact" }`. Pages
 * are requested until the exact count is reached, so a server cap SMALLER than `pageSize` (a self-hosted `max-rows`)
 * still reads everything: the next page starts where the rows actually received end, not where the page size says.
 * Without a count it stops on the first short page. Any page error fails the whole read (never a partial result), and a
 * hard ceiling on pages turns a runaway loop into an error instead of a hang.
 *
 * Same idea as readAllExportPages in account.functions.ts (the GDPR export), which throws instead of returning an
 * error value because an incomplete export must never be handed over.
 */
export const READ_PAGE_SIZE = 1000;
const MAX_PAGES = 200;

type Page<T> = {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
};

export async function readAllRows<T>(
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  pageSize: number = READ_PAGE_SIZE,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const rows: T[] = [];
  let expected: number | null = null;
  for (let pages = 0; pages < MAX_PAGES; pages++) {
    const result = await page(rows.length, rows.length + pageSize - 1);
    if (result.error) return { data: null, error: result.error };
    if (!Array.isArray(result.data)) {
      return { data: null, error: { message: "paged read: no data" } };
    }
    if (typeof result.count === "number") expected ??= result.count;
    rows.push(...result.data);
    if (result.data.length === 0) {
      // An empty page before the exact count is reached means rows moved or vanished mid-read: not the whole table.
      if (expected !== null && rows.length < expected) {
        return { data: null, error: { message: "paged read: incomplete" } };
      }
      return { data: rows, error: null };
    }
    if (expected !== null) {
      if (rows.length >= expected) return { data: rows, error: null };
    } else if (result.data.length < pageSize) {
      return { data: rows, error: null };
    }
  }
  return { data: null, error: { message: "paged read: too many pages" } };
}
