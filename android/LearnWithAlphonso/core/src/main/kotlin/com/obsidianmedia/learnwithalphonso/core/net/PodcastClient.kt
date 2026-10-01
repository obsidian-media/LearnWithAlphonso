package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastEpisode
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastFolder
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayback
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastSearch
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.time.Instant
import java.time.format.DateTimeFormatter

sealed class PodcastClientError(message: String) : Exception(message) {
    /** The token was rejected; callers stop issuing fire-and-forget saves. */
    class Unauthorized : PodcastClientError("Unauthorized")
    /** Another device wrote since we read; re-read rather than retry. */
    class StaleWrite : PodcastClientError("Stale write")
    class Server(val status: Int) : PodcastClientError("Server returned $status")
    class InvalidPayload : PodcastClientError("Unexpected response shape")
}

/**
 * Port of PodcastClient.swift over the shared SupabaseHttp seam. One
 * deliberate difference: a first save POSTs `user_id` too, as the web upsert
 * does, because podcast_playback.user_id has no column default.
 */
class PodcastClient(
    private val http: SupabaseHttp,
    private val userId: () -> String?,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {
    private companion object {
        const val EPISODE_SELECT = "id,folder_id,slug,title,description,audio_path,duration_seconds"
    }

    suspend fun fetchFolders(): List<PodcastFolder> =
        rows(http.rest(HttpMethod.Get, "podcast_folders", mapOf("select" to "id,parent_id,slug,title,description,sort_order", "order" to "sort_order.asc")))
            .mapNotNull { row ->
                PodcastFolder(
                    id = row.str("id") ?: return@mapNotNull null,
                    parentId = row.str("parent_id"),
                    slug = row.str("slug") ?: return@mapNotNull null,
                    title = row.str("title") ?: return@mapNotNull null,
                    description = row.str("description"),
                    sortOrder = row.int("sort_order") ?: 0,
                )
            }

    /** Published episodes in one folder merged with this user's saved positions; a failed playback read never fails the listing. */
    suspend fun fetchEpisodes(folderId: String): List<PodcastEpisode> {
        val episodeRows = rows(http.rest(HttpMethod.Get, "podcast_episodes", mapOf("select" to EPISODE_SELECT, "folder_id" to "eq.$folderId", "order" to "sort_order.asc")))
        val positions = HashMap<String, Pair<Int, String?>>()
        if (episodeRows.isNotEmpty()) {
            runCatching { rows(http.rest(HttpMethod.Get, "podcast_playback", mapOf("select" to "episode_id,position_seconds,updated_at"))) }
                .getOrNull()?.forEach { row -> row.str("episode_id")?.let { positions[it] = (row.int("position_seconds") ?: 0) to row.str("updated_at") } }
        }
        return episodeRows.mapNotNull { row ->
            val saved = positions[row.str("id") ?: return@mapNotNull null]
            episode(row, saved?.first ?: 0, saved?.second)
        }
    }

    /** Flat search across folders; an empty list without a request when the query is too short. */
    suspend fun searchEpisodes(query: String): List<PodcastEpisode> {
        val filter = PodcastSearch.ilikeOrFilter(query, listOf("title", "description")) ?: return emptyList()
        val response = http.rest(
            HttpMethod.Get, "podcast_episodes",
            mapOf("select" to EPISODE_SELECT, "order" to "title.asc", "limit" to "50"),
            queryList = listOf("or" to "($filter)"),
        )
        return rows(response).mapNotNull { episode(it, 0, null) }
    }

    /** Null is an ordinary answer: episodes published before transcripts existed have none. */
    suspend fun fetchTranscript(episodeId: String): String? =
        rows(http.rest(HttpMethod.Get, "podcast_transcripts", mapOf("select" to "text", "episode_id" to "eq.$episodeId", "limit" to "1"))).firstOrNull()?.str("text")

    /** Optimistic concurrency on updated_at: a stale device matches nothing and gets StaleWrite. */
    suspend fun savePlaybackPosition(episodeId: String, positionSeconds: Int, completed: Boolean, lastSeenUpdatedAt: String?) {
        val now = DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(nowMillis()))
        val body = buildJsonObject {
            put("episode_id", episodeId)
            put("position_seconds", positionSeconds)
            put("updated_at", now)
            if (completed) put("completed_at", now)
            if (lastSeenUpdatedAt == null) userId()?.let { put("user_id", it) }
        }
        val headers = mapOf("Prefer" to "return=representation")
        val response = if (lastSeenUpdatedAt != null) {
            http.rest(HttpMethod.Patch, "podcast_playback", mapOf("episode_id" to "eq.$episodeId", "updated_at" to "eq.$lastSeenUpdatedAt"), body, headers)
        } else {
            http.rest(HttpMethod.Post, "podcast_playback", emptyMap(), body, headers)
        }
        if (rows(response).isEmpty()) throw PodcastClientError.StaleWrite()
    }

    /** Through the SECURITY DEFINER RPC only; authenticated has no INSERT grant on the table. */
    suspend fun recordPlayEvent(episodeId: String, secondsListened: Int) {
        requireSuccess(http.rpc("record_podcast_play_event", buildJsonObject { put("_episode_id", episodeId); put("_seconds_listened", secondsListened) }))
    }

    private fun episode(row: JsonObject, position: Int, updatedAt: String?): PodcastEpisode? {
        val duration = row.int("duration_seconds") ?: return null
        val audioUrl = PodcastPlayback.audioUrl(http.baseUrl, row.str("audio_path") ?: return null) ?: return null
        return PodcastEpisode(
            id = row.str("id") ?: return null,
            folderId = row.str("folder_id") ?: return null,
            slug = row.str("slug") ?: return null,
            title = row.str("title") ?: return null,
            description = row.str("description"),
            audioUrl = audioUrl,
            durationSeconds = duration,
            positionSeconds = PodcastPlayback.clampPosition(position.toDouble(), duration.toDouble()).toInt(),
            playbackUpdatedAt = updatedAt,
        )
    }

    private suspend fun requireSuccess(response: HttpResponse): String {
        val status = response.status
        if (status == HttpStatusCode.Unauthorized || status == HttpStatusCode.Forbidden) throw PodcastClientError.Unauthorized()
        if (status.value !in 200..299) throw PodcastClientError.Server(status.value)
        return response.bodyAsText()
    }

    private suspend fun rows(response: HttpResponse): List<JsonObject> {
        val text = requireSuccess(response)
        if (text.isBlank()) return emptyList()
        return runCatching { ContentJson.json.parseToJsonElement(text).jsonArray.map { it.jsonObject } }
            .getOrElse { throw PodcastClientError.InvalidPayload() }
    }

    private fun JsonObject.str(key: String): String? = this[key]?.takeUnless { it is JsonNull }?.let { runCatching { it.jsonPrimitive.contentOrNull }.getOrNull() }
    private fun JsonObject.int(key: String): Int? = this[key]?.takeUnless { it is JsonNull }?.let { runCatching { it.jsonPrimitive.intOrNull }.getOrNull() }
}
