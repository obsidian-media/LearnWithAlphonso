import Foundation

/// Query building for podcast search.
///
/// **Port of `src/lib/podcast-search.ts`; its tests are
/// `src/lib/podcast-search.test.ts`, and `PodcastSearchTests` here uses the
/// same cases and values.** Nothing enforces that the two stay in step, so
/// the cross-reference is how drift becomes visible in review.
///
/// `ilike` rather than Postgres full-text search, matching the web: no
/// migration and no `tsvector` to keep in step, at the cost of no stemming
/// and a scan rather than an index. Invisible at tens to low hundreds of
/// episodes; past that, both sides should move to `tsvector` + GIN together.
///
/// The care is all in escaping, because **three** syntaxes overlap here --
/// one more than on the web:
///
/// - **LIKE** treats `%` and `_` as wildcards, so searching `50%` silently
///   becomes a prefix match on `50` plus anything.
/// - **PostgREST's `or=(...)`** separates conditions with commas and groups
///   with parentheses, so an unquoted `coffee, tea` ends the condition early.
/// - **The URL query itself**, which supabase-js handles on the web but
///   `PodcastClient` does not: it assigns `percentEncodedQuery` directly, so
///   an unencoded `%` is read as a percent-escape introducer and the server
///   sees a different string than was built.
///
/// None of the three fails loudly. All of them return plausible-looking
/// results for the wrong query.
public enum PodcastSearch {
    /// Longer than this is a paste, not a search.
    private static let maxQueryLength = 100
    /// One character matches nearly everything, so it is not a search yet.
    private static let minQueryLength = 2

    /// Trims, collapses internal whitespace and caps length. Returns nil when
    /// there is nothing worth querying for.
    public static func normalizeQuery(_ raw: String) -> String? {
        let collapsed = raw
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
        guard collapsed.count >= minQueryLength else { return nil }
        return String(collapsed.prefix(maxQueryLength))
    }

    /// Escapes LIKE's wildcards so they match literally.
    ///
    /// The backslash is replaced first, or the backslash added in front of a
    /// later `%` would be swallowed as the escape for the user's own
    /// backslash.
    public static func escapeLikeValue(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "%", with: "\\%")
            .replacingOccurrences(of: "_", with: "\\_")
    }

    /// A PostgREST `or=` filter matching `query` as a substring of any of
    /// `columns`, or nil when the query is not worth running.
    ///
    /// The value is wrapped in double quotes so commas and parentheses within
    /// it are data rather than syntax, and any double quote inside is escaped
    /// so it cannot close the quoting early.
    public static func ilikeOrFilter(query: String, columns: [String]) -> String? {
        guard let normalized = normalizeQuery(query), !columns.isEmpty else { return nil }
        let escaped = escapeLikeValue(normalized).replacingOccurrences(of: "\"", with: "\\\"")
        return columns.map { "\($0).ilike.\"%\(escaped)%\"" }.joined(separator: ",")
    }

    /// Percent-encodes a filter for use in a URL query.
    ///
    /// Kept beside the filter builder rather than inside the client so the
    /// two are tested together: building the filter correctly and then
    /// handing it to the URL unencoded would undo the escaping above.
    ///
    /// The allowed set is deliberately narrow -- alphanumerics plus the few
    /// characters PostgREST's own grammar needs (`.`, `*`, `-`, `_`) -- so
    /// quotes, commas, parentheses, spaces and `%` are all encoded.
    public static func percentEncodedFilter(_ filter: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: ".*-_")
        return filter.addingPercentEncoding(withAllowedCharacters: allowed) ?? filter
    }
}
