package com.obsidianmedia.learnwithalphonso.core.podcast

/**
 * Port of src/lib/podcast-search.ts (tests: podcast-search.test.ts). Three
 * syntaxes overlap in a search: LIKE wildcards, PostgREST's or=(...) grammar,
 * and the URL query. The first two are handled here; Ktor percent-encodes the
 * third when PodcastClient passes the filter as a query value.
 */
object PodcastSearch {
    private const val MAX_QUERY_LENGTH = 100
    private const val MIN_QUERY_LENGTH = 2

    /** Trims, collapses whitespace and caps length; null when not worth querying. */
    fun normalizeQuery(raw: String): String? {
        val collapsed = raw.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")
        if (collapsed.length < MIN_QUERY_LENGTH) return null
        return collapsed.take(MAX_QUERY_LENGTH)
    }

    /** Escapes LIKE's wildcards; the backslash first, or it would swallow a later escape. */
    fun escapeLikeValue(value: String): String =
        value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

    /** A PostgREST or= filter over [columns], quoted so commas and parens are data. */
    fun ilikeOrFilter(query: String, columns: List<String>): String? {
        val normalized = normalizeQuery(query) ?: return null
        if (columns.isEmpty()) return null
        val escaped = escapeLikeValue(normalized).replace("\"", "\\\"")
        return columns.joinToString(",") { "$it.ilike.\"%$escaped%\"" }
    }
}
