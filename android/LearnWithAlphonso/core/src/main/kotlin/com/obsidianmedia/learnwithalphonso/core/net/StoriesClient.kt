package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizAnswer
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizError
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizException
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizQuestion
import com.obsidianmedia.learnwithalphonso.core.podcast.PodcastQuizResult
import com.obsidianmedia.learnwithalphonso.core.podcast.Stories
import com.obsidianmedia.learnwithalphonso.core.podcast.Story
import com.obsidianmedia.learnwithalphonso.core.podcast.StorySummary
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.IOException

/**
 * Reads graded stories over PostgREST, saves the reading position, and sends the check's answers for grading. Port of the
 * stories half of Stories.swift; mirrors src/lib/stories.functions.ts.
 *
 * The check is graded on the SERVER: [submitCheck] posts only the chosen answers to the complete-story-check Edge Function
 * (which calls the service-role-only submit_story_check with the verified user id). The client never calls that function
 * itself and never sends a score.
 */
class StoriesClient(private val http: SupabaseHttp) {
    internal companion object {
        const val STORY_COLUMNS = "id,course,level_id,slug,title,segments,sort_order,published"
        const val PROGRESS_COLUMNS = "story_id,segment_index,best_correct,check_total,completed_at"
        const val CHECK_FUNCTION = "complete-story-check"
    }

    /**
     * The published stories in one course with this learner's progress (RLS limits both reads). A failed progress read never
     * fails the library: the stories still open, they just show as new.
     */
    suspend fun fetchStories(course: String): List<StorySummary> {
        if (course !in Stories.COURSES) return emptyList()
        val storyRows = rows(
            http.rest(
                HttpMethod.Get, "stories",
                mapOf("select" to STORY_COLUMNS, "course" to "eq.$course", "published" to "eq.true", "order" to "sort_order.asc"),
            ),
        )
        if (storyRows.isEmpty()) return emptyList()
        val ids = storyRows.mapNotNull { it.str("id") }
        val progress = HashMap<String, JsonObject>()
        try {
            rows(http.rest(HttpMethod.Get, "story_progress", mapOf("select" to PROGRESS_COLUMNS, "story_id" to "in.(${ids.joinToString(",")})")))
                .forEach { row -> row.str("story_id")?.let { progress[it] = row } }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // Progress is garnish.
        }
        return storyRows.mapNotNull { row ->
            val id = row.str("id") ?: return@mapNotNull null
            val saved = progress[id]
            StorySummary(
                id = id,
                course = row.str("course") ?: course,
                level = row.str("level_id") ?: return@mapNotNull null,
                slug = row.str("slug") ?: "",
                title = row.str("title") ?: return@mapNotNull null,
                sortOrder = row.int("sort_order") ?: 0,
                published = row.bool("published") ?: false,
                segmentIndex = saved?.int("segment_index") ?: 0,
                segmentCount = segmentList(row["segments"]).size,
                bestCorrect = saved?.int("best_correct"),
                checkTotal = saved?.int("check_total"),
                completed = saved?.str("completed_at") != null,
            )
        }
    }

    /**
     * One published story with its check questions; null when it does not exist or is not published. A question row the app
     * cannot read is an error, never dropped: a check with a hole in it would be refused by the server as the wrong number of
     * answers.
     */
    suspend fun fetchStory(id: String): Story? {
        val row = rows(http.rest(HttpMethod.Get, "stories", mapOf("select" to STORY_COLUMNS, "id" to "eq.$id", "published" to "eq.true"))).firstOrNull() ?: return null
        val course = row.str("course")?.takeIf { it in Stories.COURSES } ?: return null
        val level = row.str("level_id") ?: return null
        val title = row.str("title") ?: return null
        val questions = rows(
            http.rest(HttpMethod.Get, "story_quiz_questions", mapOf("select" to "position,prompt,choices,answer_index", "story_id" to "eq.$id", "order" to "position.asc")),
        ).map { q ->
            val position = q.int("position")
            val prompt = q.str("prompt")
            val choices = (q["choices"] as? JsonArray)?.map { el -> (el as? JsonPrimitive)?.takeIf { it.isString }?.content ?: throw PodcastClientError.InvalidPayload() }
            val answerIndex = q.int("answer_index")
            if (position == null || prompt == null || choices == null || answerIndex == null || answerIndex !in choices.indices) throw PodcastClientError.InvalidPayload()
            // The same id the server grades by: "q" plus the question's position.
            PodcastQuizQuestion("q$position", prompt, choices, answerIndex)
        }
        val resume = try {
            rows(http.rest(HttpMethod.Get, "story_progress", mapOf("select" to "segment_index", "story_id" to "eq.$id", "limit" to "1"))).firstOrNull()?.int("segment_index") ?: 0
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            0
        }
        val segments = segmentList(row["segments"])
        // A branching story has no sentences (see Stories.visible): not a story this reader can show.
        if (segments.isEmpty()) return null
        return Story(id, course, level, title, segments, questions, Stories.clampSegment(resume, segments.size))
    }

    /**
     * Through `save_story_progress`, which takes the user from auth.uid(), requires a published story and clamps the position
     * into the text. The table has no client write grant. Garnish: the reader never blocks on it.
     */
    suspend fun saveProgress(storyId: String, segmentIndex: Int) {
        requireSuccess(http.rpc("save_story_progress", buildJsonObject { put("p_story_id", storyId); put("p_segment_index", Stories.wireSegment(segmentIndex)) }))
    }

    /**
     * Sends the learner's chosen answers (never a score) to the complete-story-check Edge Function, which grades them from
     * the stored key and credits the reading skill once. Throws [PodcastQuizException]; a 2xx that cannot be read is an error,
     * never a score (a resend is harmless: a repeat only raises the best).
     */
    suspend fun submitCheck(storyId: String, answers: List<PodcastQuizAnswer>): PodcastQuizResult {
        val body = buildJsonObject {
            put("storyId", storyId)
            put("answers", buildJsonArray { answers.forEach { add(buildJsonObject { put("questionId", it.questionId); put("choiceIndex", it.choiceIndex) }) } })
        }
        val response = try {
            http.function(CHECK_FUNCTION, body)
        } catch (e: CancellationException) {
            throw e
        } catch (e: IOException) {
            throw PodcastQuizException(PodcastQuizError.OFFLINE)
        } catch (e: Exception) {
            throw PodcastQuizException(PodcastQuizError.SERVER)
        }
        when (response.status.value) {
            in 200..299 -> Unit
            404 -> throw PodcastQuizException(PodcastQuizError.NOT_FOUND)
            400 -> throw PodcastQuizException(PodcastQuizError.INVALID_ANSWERS)
            401, 403 -> throw PodcastQuizException(PodcastQuizError.UNAUTHORIZED)
            else -> throw PodcastQuizException(PodcastQuizError.SERVER)
        }
        val text = try { response.bodyAsText() } catch (e: CancellationException) { throw e } catch (e: Exception) { throw PodcastQuizException(PodcastQuizError.SERVER) }
        val obj = runCatching { ContentJson.json.parseToJsonElement(text).jsonObject }.getOrNull() ?: throw PodcastQuizException(PodcastQuizError.SERVER)
        if (obj.str("status") != "applied") throw PodcastQuizException(PodcastQuizError.SERVER)
        // A story check pays no XP: the result has the quiz's shape so the shared run is reused.
        return PodcastQuizResult(
            correct = obj.int("correct") ?: throw PodcastQuizException(PodcastQuizError.SERVER),
            total = obj.int("total") ?: throw PodcastQuizException(PodcastQuizError.SERVER),
            xpGain = 0,
            streak = 0,
            bestCorrect = obj.int("bestCorrect") ?: throw PodcastQuizException(PodcastQuizError.SERVER),
            bestXp = 0,
            missedQuestionIds = (obj["missedQuestionIds"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content } ?: emptyList(),
        )
    }

    private fun segmentList(value: Any?): List<String> =
        (value as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content } ?: emptyList()

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
    private fun JsonObject.bool(key: String): Boolean? = this[key]?.takeUnless { it is JsonNull }?.let { runCatching { it.jsonPrimitive.booleanOrNull }.getOrNull() }
}
