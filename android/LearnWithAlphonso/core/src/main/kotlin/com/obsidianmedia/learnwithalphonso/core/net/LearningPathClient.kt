package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.path.LearningPath
import com.obsidianmedia.learnwithalphonso.core.path.LearningPathChange
import com.obsidianmedia.learnwithalphonso.core.path.LearningPathDecoding
import com.obsidianmedia.learnwithalphonso.core.path.LearningPathError
import com.obsidianmedia.learnwithalphonso.core.path.PathApi
import com.obsidianmedia.learnwithalphonso.core.path.PathRestDay
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.put
import java.io.IOException

/**
 * Calls this repo's own `/api/learning-path` (src/routes/api/learning-path.ts), the same route the web and iOS screens
 * use. The server computes the plan; this only asks for it. Auth and the one refresh-and-retry on a 401 live in
 * [ApiHttp]. Failure mapping matches [LearningGoalClient]: 401/403 is NotSignedIn, any other non-2xx is Unavailable,
 * an [IOException] is Offline, and a coroutine cancellation is rethrown untouched.
 */
class LearningPathClient(private val http: ApiHttp) : PathApi {
    override suspend fun fetch(course: String): LearningPath? =
        LearningPathDecoding.path(send { http.get(PATH, mapOf("course" to course)) })

    override suspend fun change(course: String, change: LearningPathChange): LearningPath? =
        LearningPathDecoding.path(
            send {
                http.put(
                    PATH,
                    buildJsonObject {
                        put("course", course)
                        when (change) {
                            is LearningPathChange.SetOff -> {
                                put("action", "set_off")
                                put("off", buildJsonArray { change.off.forEach { add(it.wire) } })
                            }
                            LearningPathChange.LessonsFirst -> put("action", "lessons_first")
                            LearningPathChange.Resume -> put("action", "resume")
                            is LearningPathChange.SetDailyMinutes -> {
                                put("action", "set_daily_minutes")
                                put("dailyMinutes", change.minutes)
                            }
                            is LearningPathChange.SetRestDay -> {
                                put("action", "set_rest_day")
                                if (change.day == PathRestDay.NONE) put("restDay", "none") else put("restDay", change.day)
                            }
                        }
                    },
                )
            },
        )

    private suspend fun send(call: suspend () -> HttpResponse): String {
        val response: HttpResponse
        val text: String
        try {
            response = call()
            text = response.bodyAsText()
        } catch (e: CancellationException) {
            throw e
        } catch (e: LearningPathError) {
            throw e
        } catch (e: IOException) {
            throw LearningPathError.Offline
        } catch (e: Exception) {
            throw LearningPathError.Unavailable
        }
        val status = response.status.value
        if (status in 200..299) return text
        throw when (status) {
            401, 403 -> LearningPathError.NotSignedIn
            else -> LearningPathError.Unavailable
        }
    }

    private companion object {
        const val PATH = "api/learning-path"
    }
}
