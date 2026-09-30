package com.obsidianmedia.learnwithalphonso.podcast

import android.content.Context
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastCache
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastCacheBudget
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastCacheEntry
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastDownloadState
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastEpisode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File

/** What a refused download reports back (PodcastDownloadRefusal.swift). */
sealed class PodcastDownloadRefusal(message: String) : Exception(message) {
    /** Carries what could be removed to make room; the learner chooses, nothing is deleted here. */
    class BudgetExceeded(val candidates: List<PodcastCacheEntry>, val neededBytes: Long) : PodcastDownloadRefusal("Budget exceeded")
    class TransferFailed(val reason: String) : PodcastDownloadRefusal(reason)
}

/**
 * Port of PodcastDownloadManager.swift. Deliberately thin: every decision
 * (fit, candidates, staleness, paths) lives in core's PodcastCache and
 * PodcastCacheBudget where JVM tests reach it.
 */
class PodcastDownloadManager(
    context: Context,
    private val dao: PodcastDownloadDao,
    private val http: OkHttpClient,
    val budgetBytes: Long = PodcastCacheBudget.DEFAULT_BYTES,
    private val now: () -> Long = System::currentTimeMillis,
) {
    /** filesDir, not cacheDir: the system may purge caches, and a deliberate download should not evaporate. */
    private val directory: File = File(context.filesDir, "podcast-audio").apply { mkdirs() }

    private val _states = MutableStateFlow<Map<String, PodcastDownloadState>>(emptyMap())
    val states: StateFlow<Map<String, PodcastDownloadState>> = _states.asStateFlow()

    fun localFile(episodeId: String): File? = File(directory, PodcastCache.fileName(episodeId)).takeIf { it.exists() }

    suspend fun entries(): List<PodcastCacheEntry> = dao.all().map { it.asCacheEntry() }

    suspend fun usedBytes(): Long = PodcastCacheBudget.usedBytes(entries())

    suspend fun refreshStates() {
        val downloaded = dao.all().associate { it.episodeId to (PodcastDownloadState.Downloaded(it.bytes) as PodcastDownloadState) }
        _states.update { current -> downloaded + current.filterValues { it is PodcastDownloadState.Downloading || it is PodcastDownloadState.Failed } }
    }

    /** Refuses rather than deleting when the budget is reached; re-checks against the real byte count. */
    suspend fun download(episode: PodcastEpisode) {
        val existing = entries()
        val estimate = maxOf(episode.durationSeconds, 1) * 8_000L
        if (!PodcastCacheBudget.canAdd(estimate, existing, budgetBytes)) {
            throw PodcastDownloadRefusal.BudgetExceeded(PodcastCacheBudget.deletionCandidates(existing, estimate, budgetBytes), estimate)
        }
        _states.update { it + (episode.id to PodcastDownloadState.Downloading(0.0)) }
        val staging = File(directory, PodcastCache.temporaryFileName(episode.id))
        val final = File(directory, PodcastCache.fileName(episode.id))
        try {
            val (bytes, etag) = withContext(Dispatchers.IO) {
                staging.delete()
                http.newCall(Request.Builder().url(episode.audioUrl).build()).execute().use { response ->
                    if (!response.isSuccessful) throw PodcastDownloadRefusal.TransferFailed("HTTP ${response.code}")
                    val body = response.body
                    val expected = body.contentLength().takeIf { it >= 0 }
                    body.byteStream().use { input ->
                        staging.outputStream().use { output ->
                            val buffer = ByteArray(64 * 1024)
                            var copied = 0L
                            while (true) {
                                val n = input.read(buffer)
                                if (n < 0) break
                                output.write(buffer, 0, n)
                                copied += n
                                if (expected != null && expected > 0) _states.update { it + (episode.id to PodcastDownloadState.Downloading(copied.toDouble() / expected)) }
                            }
                        }
                    }
                    val actual = staging.length()
                    if (expected != null && expected != actual) {
                        staging.delete()
                        throw PodcastDownloadRefusal.TransferFailed("incomplete download")
                    }
                    actual to response.header("ETag")
                }
            }
            if (!PodcastCacheBudget.canAdd(bytes, existing, budgetBytes)) {
                staging.delete()
                throw PodcastDownloadRefusal.BudgetExceeded(PodcastCacheBudget.deletionCandidates(existing, bytes, budgetBytes), bytes)
            }
            // Atomic move last: a file at the final path always means a complete, accounted-for download.
            final.delete()
            if (!staging.renameTo(final)) throw PodcastDownloadRefusal.TransferFailed("could not move the download into place")
            dao.upsert(PodcastDownloadRecord(episode.id, bytes, etag, episode.durationSeconds, null, now()))
            _states.update { it + (episode.id to PodcastDownloadState.Downloaded(bytes)) }
        } catch (refusal: PodcastDownloadRefusal.BudgetExceeded) {
            _states.update { it + (episode.id to PodcastDownloadState.NotDownloaded) }
            throw refusal
        } catch (e: Exception) {
            staging.delete()
            _states.update { it + (episode.id to PodcastDownloadState.Failed(e.message ?: "download failed")) }
            throw if (e is PodcastDownloadRefusal) e else PodcastDownloadRefusal.TransferFailed(e.message ?: "download failed")
        }
    }

    suspend fun delete(episodeId: String) {
        withContext(Dispatchers.IO) { File(directory, PodcastCache.fileName(episodeId)).delete() }
        dao.delete(episodeId)
        _states.update { it + (episodeId to PodcastDownloadState.NotDownloaded) }
    }

    suspend fun markPlayed(episodeId: String) = dao.markPlayed(episodeId, now())

    /** Drops rows whose file is gone and files with no row; a `.partial` is always an interrupted transfer. */
    suspend fun reconcile() {
        val known = HashSet<String>()
        for (record in dao.all()) {
            val file = File(directory, PodcastCache.fileName(record.episodeId))
            if (file.exists()) known.add(file.name) else dao.delete(record.episodeId)
        }
        withContext(Dispatchers.IO) { directory.listFiles().orEmpty().filter { it.name !in known }.forEach { it.delete() } }
        refreshStates()
    }
}
