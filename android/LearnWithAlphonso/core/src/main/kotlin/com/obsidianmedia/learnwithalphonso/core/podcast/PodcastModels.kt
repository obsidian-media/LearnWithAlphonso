package com.obsidianmedia.learnwithalphonso.core.podcast

/**
 * Ports of PodcastModels.swift, which mirror the web's PodcastFolder in
 * src/lib/podcast-tree.ts and PodcastEpisode in src/lib/podcast.functions.ts.
 */
data class PodcastFolder(
    val id: String,
    val parentId: String?,
    val slug: String,
    val title: String,
    val description: String?,
    val sortOrder: Int,
)

data class PodcastEpisode(
    val id: String,
    val folderId: String,
    val slug: String,
    val title: String,
    val description: String?,
    val audioUrl: String,
    val durationSeconds: Int,
    /** Already clamped by PodcastPlayback.clampPosition when it came off the wire. */
    val positionSeconds: Int,
    /**
     * The updated_at of this user's playback row when it was read, or null
     * when no row exists yet; sent back with a save for optimistic concurrency.
     */
    val playbackUpdatedAt: String?,
)

/** Download state for one episode, as the UI sees it. */
sealed class PodcastDownloadState {
    data object NotDownloaded : PodcastDownloadState()
    data class Downloading(val progress: Double) : PodcastDownloadState()
    data class Downloaded(val bytes: Long) : PodcastDownloadState()
    data class Failed(val reason: String) : PodcastDownloadState()
}

/** One cached episode's bookkeeping (PodcastCacheEntry.swift). */
data class PodcastCacheEntry(
    val episodeId: String,
    val bytes: Long,
    /** The object's ETag as served when downloaded; Supabase serves the content MD5. */
    val etag: String?,
    val storedDurationSeconds: Int,
    val lastPlayedMillis: Long?,
)
