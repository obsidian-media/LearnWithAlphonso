package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.podcast.ListenProgress
import com.obsidianmedia.learnwithalphonso.core.podcast.ListenShelf
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastEpisode
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastFolder
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastLabel
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPlayback
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastPublishedEpisodeRef
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizAnswer
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizBest
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizError
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizException
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizOffer
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizQuestion
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizResult
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastSearch
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.IOException
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
 * deliberate difference: a first save still sends `user_id`, as the web upsert does. The column has defaulted to
 * auth.uid() since migration 20261012500000 (iOS relies on that), so it is redundant now and harmless.
 */
class PodcastClient(
    private val http: SupabaseHttp,
    private val userId: () -> String?,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {
    internal companion object {
        const val PUBLISHED_INDEX_PAGE_SIZE = 500
        const val MAX_PUBLISHED_INDEX_PAGES = 200
        const val EPISODE_SELECT = "id,folder_id,slug,title,description,audio_path,duration_seconds,source"
    }

    suspend fun fetchFolders(): List<PodcastFolder> =
        rows(http.rest(HttpMethod.Get, "podcast_folders", mapOf("select" to "id,parent_id,slug,title,description,sort_order,course", "order" to "sort_order.asc")))
            .mapNotNull { row ->
                PodcastFolder(
                    id = row.str("id") ?: return@mapNotNull null,
                    parentId = row.str("parent_id"),
                    slug = row.str("slug") ?: return@mapNotNull null,
                    title = row.str("title") ?: return@mapNotNull null,
                    description = row.str("description"),
                    sortOrder = row.int("sort_order") ?: 0,
                    course = row.str("course"),
                )
            }

    /**
     * Every published episode's id and folder. RLS already hides unpublished rows; the explicit filter states the
     * intent. Paged (ordered by id) until an empty page, because one request returns at most `max_rows`: a larger
     * catalogue would otherwise be truncated, and the caller treats this list as the whole published set when it
     * removes downloads.
     */
    suspend fun fetchPublishedIndex(): List<PodcastPublishedEpisodeRef> {
        val refs = ArrayList<PodcastPublishedEpisodeRef>()
        var offset = 0
        var pages = 0
        while (true) {
            // A server that keeps answering with rows (a paging mistake) must not loop for ever, and must not be taken for the
            // whole published set: throwing leaves the caller with nothing to prune against.
            if (++pages > MAX_PUBLISHED_INDEX_PAGES) throw PodcastClientError.InvalidPayload()
            val page = rows(
                http.rest(
                    HttpMethod.Get, "podcast_episodes",
                    mapOf("select" to "id,folder_id", "published" to "eq.true", "order" to "id.asc", "limit" to PUBLISHED_INDEX_PAGE_SIZE.toString(), "offset" to offset.toString()),
                ),
            )
            page.forEach { row ->
                val id = row.str("id")
                val folderId = row.str("folder_id")
                if (id != null && folderId != null) refs.add(PodcastPublishedEpisodeRef(id, folderId))
            }
            // Only an empty page ends the list: a server may cap a page below what was asked, and a short page would then
            // look like the end and silently truncate the set that downloads are pruned against.
            if (page.isEmpty()) return refs
            offset += page.size
        }
    }

    /** Published episodes in one folder merged with this user's saved positions; a failed playback read never fails the listing. */
    suspend fun fetchEpisodes(folderId: String? = null): List<PodcastEpisode> {
        // With no folder, every published episode (the Listen shelf's one-read library).
        val episodeQuery = buildMap {
            put("select", EPISODE_SELECT)
            if (folderId != null) put("folder_id", "eq.$folderId")
            put("order", "sort_order.asc")
        }
        val episodeRows = rows(http.rest(HttpMethod.Get, "podcast_episodes", episodeQuery))
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

    /**
     * Optimistic concurrency on updated_at: a stale device matches nothing and gets StaleWrite. With no row known the
     * write is an upsert on the (user_id, episode_id) key, so it also works when the row exists but this device has
     * forgotten it (a plain POST would conflict). Returns the `updated_at` the SERVER stored, the only correct value to
     * guard the next write on.
     */
    suspend fun savePlaybackPosition(episodeId: String, positionSeconds: Int, completed: Boolean, lastSeenUpdatedAt: String?): String? {
        val now = DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(nowMillis()))
        val body = buildJsonObject {
            put("episode_id", episodeId)
            put("position_seconds", positionSeconds)
            put("updated_at", now)
            if (completed) put("completed_at", now)
            if (lastSeenUpdatedAt == null) userId()?.let { put("user_id", it) }
        }
        val response = if (lastSeenUpdatedAt != null) {
            http.rest(HttpMethod.Patch, "podcast_playback", mapOf("episode_id" to "eq.$episodeId", "updated_at" to "eq.$lastSeenUpdatedAt"), body, mapOf("Prefer" to "return=representation"))
        } else {
            http.rest(HttpMethod.Post, "podcast_playback", mapOf("on_conflict" to "user_id,episode_id"), body, mapOf("Prefer" to "resolution=merge-duplicates,return=representation"))
        }
        val saved = rows(response).firstOrNull() ?: throw PodcastClientError.StaleWrite()
        return saved.str("updated_at")
    }

    /** This user's listening progress (the `listen_progress` table; own rows only by RLS). */
    suspend fun fetchListenProgress(): List<ListenProgress> =
        rows(http.rest(HttpMethod.Get, "listen_progress", mapOf("select" to "episode_id,position_s,completed_at,updated_at"))).mapNotNull { row ->
            ListenProgress(
                episodeId = row.str("episode_id") ?: return@mapNotNull null,
                positionS = row.int("position_s") ?: 0,
                completedAt = row.str("completed_at"),
                updatedAt = row.str("updated_at") ?: return@mapNotNull null,
            )
        }

    /** Seconds this user listened since the start of the current UTC month (`podcast_play_events`, own rows by RLS). */
    suspend fun fetchMonthListenedSeconds(): Int =
        ListenShelf.monthSeconds(
            rows(http.rest(HttpMethod.Get, "podcast_play_events", mapOf("select" to "seconds_listened", "started_at" to "gte.${ListenShelf.monthStartIso(nowMillis())}")))
                .map { it.int("seconds_listened") ?: 0 },
        )

    /**
     * Through `save_listen_progress`, which takes the user from auth.uid(), requires a published episode and clamps the
     * position into the episode. The table has no client write grant.
     */
    suspend fun saveListenProgress(episodeId: String, positionSeconds: Int) {
        requireSuccess(http.rpc("save_listen_progress", buildJsonObject { put("p_episode_id", episodeId); put("p_position_s", ListenShelf.wirePosition(positionSeconds)) }))
    }

    /** Through the SECURITY DEFINER RPC only; authenticated has no INSERT grant on the table. */
    suspend fun recordPlayEvent(episodeId: String, secondsListened: Int) {
        requireSuccess(http.rpc("record_podcast_play_event", buildJsonObject { put("_episode_id", episodeId); put("_seconds_listened", secondsListened) }))
    }

    /**
     * An episode's quiz as the signed-in learner may see it, plus their banked best. RLS decides visibility, like the
     * episode's audio and transcript. Null when there is no quiz. A row the app cannot read is an error, never dropped: a
     * quiz with a hole in it would be rejected by the server as the wrong number of answers, or look complete while missing
     * a question. A failed read of the best score never hides the quiz; it is only a label.
     */
    suspend fun fetchQuiz(episodeId: String): PodcastQuizOffer? {
        val questions = rows(
            http.rest(HttpMethod.Get, "podcast_quiz_questions", mapOf("select" to "id,prompt,choices,answer_index", "episode_id" to "eq.$episodeId", "order" to "sort_order.asc")),
        ).map { row ->
            val id = row.str("id")
            val prompt = row.str("prompt")
            val choices = (row["choices"] as? JsonArray)?.map { el -> (el as? JsonPrimitive)?.takeIf { it.isString }?.content ?: throw PodcastClientError.InvalidPayload() }
            val answerIndex = row.int("answer_index")
            if (id == null || prompt == null || choices == null || answerIndex == null || answerIndex !in choices.indices) throw PodcastClientError.InvalidPayload()
            PodcastQuizQuestion(id, prompt, choices, answerIndex)
        }
        if (questions.isEmpty()) return null
        val best = try {
            rows(http.rest(HttpMethod.Get, "podcast_quiz_awards", mapOf("select" to "best_correct,best_xp", "episode_id" to "eq.$episodeId", "limit" to "1"))).firstOrNull()?.let { row ->
                val correct = row.int("best_correct")
                val xp = row.int("best_xp")
                if (correct != null && xp != null) PodcastQuizBest(correct, xp) else null
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
        return PodcastQuizOffer(questions, best)
    }

    /** Which of these episodes have a quiz the learner can open, for the "Take the quiz" button. One request; none for an empty list. */
    suspend fun fetchQuizEpisodeIds(episodeIds: List<String>): Set<String> {
        if (episodeIds.isEmpty()) return emptySet()
        // One row per question, so many rows per episode: page until an empty page so a server max-rows cap cannot drop episodes.
        val found = HashSet<String>()
        var offset = 0
        var pages = 0
        while (true) {
            if (++pages > MAX_PUBLISHED_INDEX_PAGES) throw PodcastClientError.InvalidPayload()
            val page = rows(
                http.rest(
                    HttpMethod.Get, "podcast_quiz_questions",
                    mapOf("select" to "episode_id", "episode_id" to "in.(${episodeIds.joinToString(",")})", "order" to "episode_id.asc,id.asc", "limit" to PUBLISHED_INDEX_PAGE_SIZE.toString(), "offset" to offset.toString()),
                ),
            )
            if (page.isEmpty()) return found
            page.forEach { row -> row.str("episode_id")?.let { found.add(it) } }
            offset += page.size
        }
    }

    /**
     * Sends the learner's chosen answers and the time they finished to the complete-podcast-quiz Edge Function, never a
     * score. The server clamps `completedAt` like a lesson's. Throws [PodcastQuizException]; a 2xx that cannot be read is
     * an error, never a score (the server may have recorded it, and a resend is harmless: a replay that adds nothing pays nothing).
     */
    suspend fun submitQuiz(episodeId: String, answers: List<PodcastQuizAnswer>, completedAtMillis: Long): PodcastQuizResult {
        val body = buildJsonObject {
            put("episodeId", episodeId)
            put("answers", buildJsonArray { answers.forEach { add(buildJsonObject { put("questionId", it.questionId); put("choiceIndex", it.choiceIndex) }) } })
            put("completedAt", DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(completedAtMillis)))
        }
        val response = try {
            http.function("complete-podcast-quiz", body)
        } catch (e: CancellationException) {
            throw e
        } catch (e: IOException) {
            throw PodcastQuizException(PodcastQuizError.OFFLINE)
        } catch (e: Exception) {
            throw PodcastQuizException(PodcastQuizError.SERVER)
        }
        when (response.status.value) {
            in 200..299 -> Unit
            429 -> throw PodcastQuizException(PodcastQuizError.RATE_LIMITED)
            404 -> throw PodcastQuizException(PodcastQuizError.NOT_FOUND)
            400 -> throw PodcastQuizException(PodcastQuizError.INVALID_ANSWERS)
            401, 403 -> throw PodcastQuizException(PodcastQuizError.UNAUTHORIZED)
            else -> throw PodcastQuizException(PodcastQuizError.SERVER)
        }
        val text = try { response.bodyAsText() } catch (e: CancellationException) { throw e } catch (e: Exception) { throw PodcastQuizException(PodcastQuizError.SERVER) }
        val obj = runCatching { ContentJson.json.parseToJsonElement(text).jsonObject }.getOrNull() ?: throw PodcastQuizException(PodcastQuizError.SERVER)
        if (obj.str("status") != "applied") throw PodcastQuizException(PodcastQuizError.SERVER)
        return PodcastQuizResult(
            correct = obj.int("correct") ?: throw PodcastQuizException(PodcastQuizError.SERVER),
            total = obj.int("total") ?: throw PodcastQuizException(PodcastQuizError.SERVER),
            xpGain = obj.int("xpGain") ?: throw PodcastQuizException(PodcastQuizError.SERVER),
            streak = obj.int("streak") ?: 0,
            bestCorrect = obj.int("bestCorrect") ?: throw PodcastQuizException(PodcastQuizError.SERVER),
            bestXp = obj.int("bestXp") ?: throw PodcastQuizException(PodcastQuizError.SERVER),
            missedQuestionIds = (obj["missedQuestionIds"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content } ?: emptyList(),
        )
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
            aiNarrated = PodcastLabel.isAiNarrated(row.str("source")),
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
