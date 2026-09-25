/**
 * Query building for podcast search (Phase 3).
 *
 * Deliberately `ilike` over PostgREST rather than Postgres full-text search:
 * no migration, no tsvector column to keep in step, and it works identically
 * from the web app and from iOS's `PodcastClient`. The trade is that it does
 * no stemming ("ordering" will not match "order") and scans rather than using
 * an index. With a library of tens to low hundreds of episodes that is
 * invisible; past roughly a thousand, or as soon as stemming matters, this
 * should become a `tsvector` column with a GIN index and a
 * `websearch_to_tsquery` RPC. Written down so the switch is a decision rather
 * than a surprise.
 *
 * The care here is all in escaping, because two different syntaxes overlap:
 *
 * - **LIKE** treats `%` and `_` as wildcards, so a learner searching `50%`
 *   would get a prefix match on `50` plus anything.
 * - **PostgREST's `or=(...)`** separates conditions with commas and groups
 *   with parentheses, so an unquoted `coffee, tea` ends the condition early.
 *
 * Neither failure looks like a failure: both return plausible-looking
 * results for the wrong query.
 */

/** Longer than this is a paste, not a search. */
const MAX_QUERY_LENGTH = 100;
/** One character matches nearly everything, so it is not a search yet. */
const MIN_QUERY_LENGTH = 2;

/**
 * Trims, collapses internal whitespace, and caps length. Returns null when
 * there is nothing worth querying for.
 */
export function normalizeQuery(raw: string): string | null {
  const collapsed = raw.trim().replace(/\s+/g, " ");
  if (collapsed.length < MIN_QUERY_LENGTH) return null;
  return collapsed.slice(0, MAX_QUERY_LENGTH);
}

/**
 * Escapes LIKE's wildcards so they match literally.
 *
 * The backslash is escaped first, or the backslash this function adds in
 * front of a later `%` would be swallowed as the escape for the user's own
 * backslash.
 */
export function escapeLikeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * A PostgREST `or=` filter matching `query` as a substring of any of
 * `columns`, or null when the query is not worth running.
 *
 * The value is wrapped in double quotes so commas and parentheses inside it
 * are data rather than syntax, and any double quote within is escaped so it
 * cannot close the quoting early.
 */
export function buildIlikeOrFilter(query: string, columns: readonly string[]): string | null {
  const normalized = normalizeQuery(query);
  if (normalized === null || columns.length === 0) return null;

  const escaped = escapeLikeValue(normalized).replace(/"/g, '\\"');
  return columns.map((column) => `${column}.ilike."%${escaped}%"`).join(",");
}
