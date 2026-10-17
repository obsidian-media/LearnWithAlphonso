package com.obsidianmedia.learnwithalphonso.core.podcast

import java.io.IOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.UnknownHostException

/** One published episode, as the index lists it. */
data class PodcastPublishedEpisodeRef(val episodeId: String, val folderId: String)

/** Why a download did not land (PodcastDownloadFailure in PodcastDownloadValidation.swift). */
sealed interface PodcastDownloadFailure {
    /** Would exceed the downloads budget. Carries what could be removed; nothing is deleted without the learner choosing. */
    data class BudgetExceeded(val candidates: List<PodcastCacheEntry>, val neededBytes: Long) : PodcastDownloadFailure
    data object NoSpace : PodcastDownloadFailure
    data object Offline : PodcastDownloadFailure
    data object Network : PodcastDownloadFailure
    data object NotFound : PodcastDownloadFailure
    data class Server(val status: Int) : PodcastDownloadFailure
    data class InvalidContent(val contentType: String?) : PodcastDownloadFailure
    data class Incomplete(val expected: Long?, val actual: Long) : PodcastDownloadFailure
}

/** Every check a finished transfer must pass before it may become a downloaded episode. */
object PodcastDownloadValidation {
    /** 16 kbps. Episodes are ~64 kbps, so anything under a quarter of that for its duration is not the episode. */
    const val MINIMUM_BYTES_PER_SECOND = 2_000L

    /**
     * Status and type, checked before the body is kept at all. Supabase Storage answers a missing public object with
     * HTTP 400 and a JSON body; that body used to be saved as `<id>.mp3`.
     */
    fun checkResponse(statusCode: Int, contentType: String?): PodcastDownloadFailure? {
        when (statusCode) {
            200 -> Unit
            400, 403, 404, 410 -> return PodcastDownloadFailure.NotFound
            else -> return PodcastDownloadFailure.Server(statusCode)
        }
        val mediaType = contentType?.substringBefore(';')?.trim()?.lowercase()
        if (mediaType == null || !mediaType.startsWith("audio/")) return PodcastDownloadFailure.InvalidContent(contentType)
        return null
    }

    /** The body's real size against what the server declared, or, when it declared nothing, against a floor derived from the episode's duration. */
    fun checkBody(expectedLength: Long?, actualBytes: Long, durationSeconds: Int): PodcastDownloadFailure? {
        if (actualBytes <= 0) return PodcastDownloadFailure.Incomplete(expectedLength, actualBytes)
        if (expectedLength != null) return if (expectedLength == actualBytes) null else PodcastDownloadFailure.Incomplete(expectedLength, actualBytes)
        val floor = maxOf(durationSeconds, 1) * MINIMUM_BYTES_PER_SECOND
        return if (actualBytes >= floor) null else PodcastDownloadFailure.Incomplete(null, actualBytes)
    }

    /** A thrown error, by its whole cause chain. */
    fun classify(error: Throwable): PodcastDownloadFailure {
        val chain = generateSequence(error) { it.cause }.take(8).toList()
        if (chain.any { it is IOException && (it.message.orEmpty().contains("ENOSPC") || it.message.orEmpty().contains("No space left", ignoreCase = true)) }) {
            return PodcastDownloadFailure.NoSpace
        }
        if (chain.any { it is UnknownHostException || it is NoRouteToHostException || (it is ConnectException) }) return PodcastDownloadFailure.Offline
        return PodcastDownloadFailure.Network
    }
}

object PodcastDownloadCopy {
    fun title(failure: PodcastDownloadFailure): String = when (failure) {
        is PodcastDownloadFailure.BudgetExceeded -> "Not enough space set aside"
        PodcastDownloadFailure.NoSpace -> "Not enough storage"
        PodcastDownloadFailure.Offline -> "You're offline"
        PodcastDownloadFailure.Network, is PodcastDownloadFailure.Incomplete -> "Download interrupted"
        PodcastDownloadFailure.NotFound -> "Episode unavailable"
        is PodcastDownloadFailure.Server, is PodcastDownloadFailure.InvalidContent -> "Server problem"
    }

    fun message(failure: PodcastDownloadFailure): String = when (failure) {
        is PodcastDownloadFailure.BudgetExceeded ->
            if (failure.candidates.isEmpty()) "This episode is larger than the space set aside for downloads."
            // Names what to remove; removes nothing.
            else "Remove ${failure.candidates.size} downloaded episode${if (failure.candidates.size == 1) "" else "s"} to make room, starting with the ones you haven't played."
        PodcastDownloadFailure.NoSpace -> "Your phone is out of storage. Free up some space, then try the download again."
        PodcastDownloadFailure.Offline -> "Connect to the internet to download this episode."
        PodcastDownloadFailure.Network, is PodcastDownloadFailure.Incomplete -> "The connection dropped before the episode finished downloading. Try again."
        PodcastDownloadFailure.NotFound -> "This episode isn't available to download right now."
        is PodcastDownloadFailure.Server, is PodcastDownloadFailure.InvalidContent -> "Our server didn't send the episode correctly. Try again in a moment."
    }
}

/**
 * What Listen shows for the active course (PodcastLibrary.swift). Root folders carry a course; a root with no course is
 * shown to every course. Within the course, a folder is shown only if at least one published episode sits somewhere
 * beneath it, so unpublishing never leaves an empty folder to tap into.
 */
object PodcastLibrary {
    fun visibleFolders(folders: List<PodcastFolder>, publishedFolderIds: Set<String>, courseCode: String): List<PodcastFolder> {
        val childrenByParent = folders.groupBy { it.parentId }
        val nonEmpty = HashSet<String>()

        fun hasContent(folder: PodcastFolder, depth: Int): Boolean {
            // Roots have null parents, and cycle members never do, so a cycle is unreachable from here; the depth bound is belt and braces.
            if (depth >= 64) return false
            var found = folder.id in publishedFolderIds
            for (child in childrenByParent[folder.id].orEmpty()) if (hasContent(child, depth + 1)) found = true
            if (found) nonEmpty.add(folder.id)
            return found
        }

        for (root in childrenByParent[null].orEmpty()) if (root.course == null || root.course == courseCode) hasContent(root, 0)
        return folders.filter { it.id in nonEmpty }
    }

    fun episodes(episodes: List<PodcastEpisode>, inFolders: List<PodcastFolder>): List<PodcastEpisode> {
        val visible = inFolders.map { it.id }.toSet()
        return episodes.filter { it.folderId in visible }
    }

    /**
     * Whether a successful read may be used to remove downloads of unpublished episodes. A read that returns no folders
     * at all is a role or policy problem (the library is never genuinely folder-less), so it says nothing about what is published.
     */
    fun canPruneDownloads(afterLoading: List<PodcastFolder>): Boolean = afterLoading.isNotEmpty()

    fun unpublishedDownloads(entries: List<PodcastCacheEntry>, publishedEpisodeIds: Set<String>, playingEpisodeId: String?): List<String> =
        entries.map { it.episodeId }.filter { it !in publishedEpisodeIds && it != playingEpisodeId }

    fun emptyTitle(courseCode: String): String = when (courseCode) {
        "en" -> "No English episodes yet"
        "fr" -> "No French episodes yet"
        "es" -> "No Spanish episodes yet"
        else -> "No episodes yet"
    }

    const val EMPTY_MESSAGE = "New episodes appear here as they're published."
}
