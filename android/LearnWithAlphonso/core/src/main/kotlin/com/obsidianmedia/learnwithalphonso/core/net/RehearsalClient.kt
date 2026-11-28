package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.rehearsal.OutcomeChoice
import com.obsidianmedia.learnwithalphonso.core.rehearsal.Rehearsal
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalApi
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalDecoding
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalError
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalIntake
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalPreset
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalResult
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalState
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Calls `/api/rehearsal` (src/routes/api/rehearsal.ts): GET ?course= for the state, POST for create, adjust, cancel,
 * delete and the "how did it go" outcome. A refusal never throws: it is a [RehearsalResult.Failed] carrying the same
 * error the web's errorOf gives (402 paywall, 503 retry, 400 blocked_text, 409 active_exists or closed, 404 not_found
 * or not_enabled, 403 consent, 400 invalid), so a screen shows words, never a status. Auth and the one refresh-and-retry
 * on a 401 live in [ApiHttp].
 */
class RehearsalClient(private val http: ApiHttp) : RehearsalApi {
    override suspend fun state(course: String): RehearsalResult<RehearsalState> =
        send({ http.get(PATH, mapOf("course" to course)) }) { RehearsalDecoding.state(it) }

    override suspend fun create(intake: RehearsalIntake): RehearsalResult<Rehearsal> =
        post(intakeBody("create", null, intake)) { RehearsalDecoding.rehearsal(it) }

    override suspend fun presets(course: String): RehearsalResult<List<RehearsalPreset>> =
        send({ http.get(PRESETS_PATH, mapOf("course" to course)) }) { RehearsalDecoding.presets(it) }

    override suspend fun createFromPreset(course: String, presetId: String, eventDate: String?): RehearsalResult<Rehearsal> =
        post(presetBody(course, presetId, eventDate)) { RehearsalDecoding.rehearsal(it) }

    override suspend fun adjust(id: String, intake: RehearsalIntake): RehearsalResult<Rehearsal> =
        post(intakeBody("adjust", id, intake)) { RehearsalDecoding.rehearsal(it) }

    override suspend fun cancel(id: String): RehearsalResult<Rehearsal> =
        post(buildJsonObject { put("action", "cancel"); put("id", id) }) { RehearsalDecoding.rehearsal(it) }

    /** "How did it go?": taps only. `moved` carries the new date (YYYY-MM-DD); the others close the rehearsal. */
    override suspend fun outcome(id: String, choice: OutcomeChoice, newDate: String?): RehearsalResult<Rehearsal> =
        post(outcomeBody(id, choice, newDate)) { RehearsalDecoding.rehearsal(it) }

    override suspend fun delete(id: String): RehearsalResult<Unit> =
        post(buildJsonObject { put("action", "delete"); put("id", id) }) { Unit }

    private suspend fun <T : Any> post(body: JsonObject, decode: (String) -> T?): RehearsalResult<T> =
        send({ http.post(PATH, body) }, decode)

    private suspend fun <T : Any> send(call: suspend () -> HttpResponse, decode: (String) -> T?): RehearsalResult<T> {
        val response: HttpResponse
        val text: String
        try {
            response = call()
            text = response.bodyAsText()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return RehearsalResult.Failed(RehearsalError.FAILED)
        }
        val status = response.status.value
        if (status !in 200..299) return RehearsalResult.Failed(RehearsalError.of(status, RehearsalDecoding.errorCode(text)))
        val value = decode(text) ?: return RehearsalResult.Failed(RehearsalError.FAILED)
        return RehearsalResult.Ok(value)
    }

    companion object {
        const val PATH = "api/rehearsal"
        const val PRESETS_PATH = "api/rehearsal-presets"

        /** The quick-start create body: the course and the preset id, and the date only with a value. */
        fun presetBody(course: String, presetId: String, eventDate: String?): JsonObject = buildJsonObject {
            put("action", "create")
            put("course", course)
            put("preset", presetId)
            if (eventDate != null) put("eventDate", eventDate)
        }

        /** The create or adjust POST body: the action (and the id for adjust) plus the four intake answers. */
        fun intakeBody(action: String, id: String?, intake: RehearsalIntake): JsonObject = buildJsonObject {
            put("action", action)
            if (id != null) put("id", id)
            put("course", intake.course)
            put("eventKind", intake.eventKind.wire)
            put("eventDate", intake.eventDate)
            put("counterpart", intake.counterpart)
            put("worries", intake.worries)
        }

        /** The outcome POST body; `newDate` is sent only with a value. */
        fun outcomeBody(id: String, choice: OutcomeChoice, newDate: String?): JsonObject = buildJsonObject {
            put("action", "outcome")
            put("id", id)
            put("choice", choice.wire)
            if (newDate != null) put("newDate", newDate)
        }
    }
}
