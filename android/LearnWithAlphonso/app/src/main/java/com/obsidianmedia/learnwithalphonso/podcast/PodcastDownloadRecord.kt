package com.obsidianmedia.learnwithalphonso.podcast

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Upsert
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastCacheEntry

/** One downloaded episode's bookkeeping (PodcastDownloadRecord.swift), in the shared Room database. */
@Entity(tableName = "podcast_downloads")
data class PodcastDownloadRecord(
    @PrimaryKey val episodeId: String,
    val bytes: Long,
    val etag: String?,
    val storedDurationSeconds: Int,
    val lastPlayed: Long?,
    val downloadedAt: Long,
) {
    fun asCacheEntry() = PodcastCacheEntry(episodeId, bytes, etag, storedDurationSeconds, lastPlayed)
}

@Dao
interface PodcastDownloadDao {
    @Query("SELECT * FROM podcast_downloads")
    suspend fun all(): List<PodcastDownloadRecord>

    @Query("SELECT * FROM podcast_downloads WHERE episodeId = :episodeId")
    suspend fun byId(episodeId: String): PodcastDownloadRecord?

    @Upsert
    suspend fun upsert(record: PodcastDownloadRecord)

    @Query("DELETE FROM podcast_downloads WHERE episodeId = :episodeId")
    suspend fun delete(episodeId: String)

    @Query("UPDATE podcast_downloads SET lastPlayed = :at WHERE episodeId = :episodeId")
    suspend fun markPlayed(episodeId: String, at: Long)
}
