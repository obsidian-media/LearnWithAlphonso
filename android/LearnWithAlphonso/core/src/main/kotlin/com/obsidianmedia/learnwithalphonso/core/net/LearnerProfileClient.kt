package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.firstrun.LearnerAnswers
import com.obsidianmedia.learnwithalphonso.core.firstrun.LearnerProfile
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.io.IOException

sealed class LearnerProfileError(message: String? = null) : Exception(message) {
    object Offline : LearnerProfileError()
    object NotSignedIn : LearnerProfileError()
    /** The server refused the answers (a value off its lists); nothing was written. */
    object Invalid : LearnerProfileError()
    /** The server's own message, e.g. "Your answers were saved, but your flag setting wasn't. Try again." */
    class Failed(val serverMessage: String?) : LearnerProfileError(serverMessage)
}

/**
 * Calls this repo's `/api/learner-profile` (src/routes/api/learner-profile.ts): the same checked save the web's
 * saveLearnerProfile makes. The app never writes `user_metadata.learner_profile` itself.
 */
class LearnerProfileClient(private val http: ApiHttp) {
    enum class Mark(val wire: String) { COMPLETED("completed"), DISMISSED("dismissed") }

    suspend fun fetch(): LearnerProfile = LearnerProfile.parse(profileOf(send { http.get(PATH) }))

    /** Saves [answers] (only the keys that are set) and, optionally, Finish or Not now. Returns the merged profile. */
    suspend fun save(answers: LearnerAnswers, mark: Mark? = null): LearnerProfile {
        val body = buildJsonObject {
            put("patch", answers.jsonPatch())
            mark?.let { put("mark", it.wire) }
        }
        return LearnerProfile.parse(profileOf(send { http.put(PATH, body) }))
    }

    private fun profileOf(text: String) = runCatching { ContentJson.json.parseToJsonElement(text).jsonObject["profile"] }.getOrNull()

    private suspend fun send(call: suspend () -> HttpResponse): String {
        val response: HttpResponse
        val text: String
        try {
            response = call()
            text = response.bodyAsText()
        } catch (e: CancellationException) {
            throw e
        } catch (e: IOException) {
            throw LearnerProfileError.Offline
        } catch (e: Exception) {
            throw LearnerProfileError.Failed(null)
        }
        val status = response.status.value
        if (status in 200..299) return text
        throw when (status) {
            400 -> LearnerProfileError.Invalid
            401, 403 -> LearnerProfileError.NotSignedIn
            else -> LearnerProfileError.Failed(
                runCatching { ContentJson.json.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.contentOrNull }.getOrNull(),
            )
        }
    }

    private companion object {
        const val PATH = "api/learner-profile"
    }
}
