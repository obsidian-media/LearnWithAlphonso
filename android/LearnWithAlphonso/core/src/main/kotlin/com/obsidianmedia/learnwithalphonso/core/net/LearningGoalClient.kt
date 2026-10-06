package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.goal.GoalApi
import com.obsidianmedia.learnwithalphonso.core.goal.GoalPlan
import com.obsidianmedia.learnwithalphonso.core.goal.LearningGoalDecoding
import com.obsidianmedia.learnwithalphonso.core.goal.LearningGoalError
import com.obsidianmedia.learnwithalphonso.core.goal.LearningGoalState
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.IOException

/**
 * Calls this repo's own `/api/learning-goal` (src/routes/api/learning-goal.ts), the same route the web and iOS cards
 * use. The server computes the plan; this only asks for it and tells the learner how it went. Auth and the one
 * refresh-and-retry on a 401 live in [ApiHttp].
 *
 * Failure mapping (same as the web and iOS clients): 400 is [LearningGoalError.Invalid] with the server's reason,
 * 401/403 is [LearningGoalError.NotSignedIn], any other non-2xx is [LearningGoalError.Unavailable], an
 * [IOException] is [LearningGoalError.Offline], and a coroutine cancellation is rethrown untouched (a screen that
 * went away is not an error and not "offline").
 */
class LearningGoalClient(private val http: ApiHttp) : GoalApi {
    override suspend fun fetch(course: String): LearningGoalState =
        LearningGoalDecoding.state(send { http.get(PATH, mapOf("course" to course)) })

    /** The plan for a candidate goal. Writes nothing on the server. */
    override suspend fun preview(course: String, targetLevel: String, targetDate: String): GoalPlan =
        LearningGoalDecoding.plan(
            send { http.get(PATH, linkedMapOf("course" to course, "targetLevel" to targetLevel, "targetDate" to targetDate)) },
        )

    override suspend fun save(course: String, targetLevel: String, targetDate: String): LearningGoalState =
        LearningGoalDecoding.state(
            send {
                http.put(PATH, buildJsonObject { put("course", course); put("targetLevel", targetLevel); put("targetDate", targetDate) })
            },
        )

    override suspend fun remove(course: String) {
        send { http.delete(PATH, mapOf("course" to course)) }
    }

    /** Sends, maps every failure mode to a [LearningGoalError], and returns the body text of a 2xx. */
    private suspend fun send(call: suspend () -> HttpResponse): String {
        val response: HttpResponse
        val text: String
        try {
            response = call()
            text = response.bodyAsText()
        } catch (e: CancellationException) {
            throw e
        } catch (e: LearningGoalError) {
            throw e
        } catch (e: IOException) {
            throw LearningGoalError.Offline
        } catch (e: Exception) {
            throw LearningGoalError.Unavailable
        }
        val status = response.status.value
        if (status in 200..299) return text
        throw when (status) {
            400 -> LearningGoalError.Invalid(reasonOf(text))
            401, 403 -> LearningGoalError.NotSignedIn
            else -> LearningGoalError.Unavailable
        }
    }

    private fun reasonOf(text: String): String? =
        runCatching { ContentJson.json.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.contentOrNull }.getOrNull()
            ?.trim()?.takeIf { it.isNotEmpty() }

    private companion object {
        const val PATH = "api/learning-goal"
    }
}
