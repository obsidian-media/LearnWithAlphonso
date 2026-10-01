package com.obsidianmedia.learnwithalphonso.core.podcast

/** Port of PodcastCache.swift: paths, staleness and the offline listing. All pure. */
object PodcastCache {
    private fun sanitise(episodeId: String): String {
        val cleaned = episodeId.lowercase().map { c -> if (c in 'a'..'z' || c in '0'..'9' || c == '-') c else '_' }.joinToString("")
        return cleaned.ifEmpty { "episode" }
    }

    fun fileName(episodeId: String): String = "${sanitise(episodeId)}.mp3"

    /** A distinct name, so a file at the final path always means a finished download. */
    fun temporaryFileName(episodeId: String): String = "${sanitise(episodeId)}.partial"

    /** False when nothing is known: never discard a download on ignorance. */
    fun isStale(entry: PodcastCacheEntry, servedEtag: String?, servedBytes: Long?): Boolean {
        if (entry.etag != null && servedEtag != null) return normalisedEtag(entry.etag) != normalisedEtag(servedEtag)
        if (servedBytes != null) return servedBytes != entry.bytes
        return false
    }

    private fun normalisedEtag(tag: String): String = tag.removePrefix("W/").trim('"')

    /** A non-finite or zero cached duration is "not loaded yet", not a disagreement. */
    fun durationDisagrees(cachedSeconds: Double, storedSeconds: Int): Boolean {
        if (!cachedSeconds.isFinite() || cachedSeconds <= 0) return false
        return kotlin.math.abs(cachedSeconds - storedSeconds) > 1
    }

    /** The downloaded set, flat and ordered by title; an entry with no episode is dropped. */
    fun offlineListing(entries: List<PodcastCacheEntry>, episodes: List<PodcastEpisode>): List<PodcastEpisode> {
        val downloaded = entries.map { it.episodeId }.toSet()
        return episodes.filter { it.id in downloaded }.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.title })
    }
}

/** Port of PodcastCacheBudget.swift: nothing here deletes; it refuses and offers. */
object PodcastCacheBudget {
    /** Roughly 170 episodes at 3 MB; injectable everywhere so the refusal path is testable. */
    const val DEFAULT_BYTES = 500_000_000L

    fun usedBytes(entries: List<PodcastCacheEntry>): Long = entries.sumOf { it.bytes }

    fun canAdd(bytes: Long, entries: List<PodcastCacheEntry>, budget: Long): Boolean = usedBytes(entries) + bytes <= budget

    /**
     * Entries to offer for deletion so [needing] bytes would fit: never played
     * first, then least recently played. Empty when it already fits; everything
     * when even an empty cache would not be enough.
     */
    fun deletionCandidates(entries: List<PodcastCacheEntry>, needing: Long, budget: Long): List<PodcastCacheEntry> {
        if (canAdd(needing, entries, budget)) return emptyList()
        val ranked = entries.sortedWith(
            compareBy<PodcastCacheEntry> { it.lastPlayedMillis != null }
                .thenBy { it.lastPlayedMillis ?: 0L }
                .thenBy { it.episodeId },
        )
        val chosen = ArrayList<PodcastCacheEntry>()
        val remaining = entries.toMutableList()
        for (candidate in ranked) {
            chosen.add(candidate)
            remaining.removeAll { it.episodeId == candidate.episodeId }
            if (canAdd(needing, remaining, budget)) break
        }
        return chosen
    }
}
