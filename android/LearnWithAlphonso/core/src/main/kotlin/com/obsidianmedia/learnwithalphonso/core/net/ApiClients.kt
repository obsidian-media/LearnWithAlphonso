package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.client.statement.readRawBytes
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * Calls to the web app's own API routes (api/account-export, api/grade-translation, ...) on API_BASE_URL. They take the
 * Supabase JWT as a Bearer token and retry once with a refreshed token on a
 * 401, the same as AccountClient.swift / AIConversationClient.swift.
 */
class ApiHttp(
    val baseUrl: String,
    private val accessToken: suspend () -> String?,
    engine: HttpClientEngine,
    private val refresh: (suspend () -> String?)? = null,
) {
    private val client = HttpClient(engine) { expectSuccess = false }

    suspend fun post(path: String, body: JsonObject?): HttpResponse {
        val first = send(path, body, accessToken())
        if (first.status != HttpStatusCode.Unauthorized || refresh == null) return first
        val fresh = refresh.invoke() ?: return first
        return send(path, body, fresh)
    }

    private suspend fun send(path: String, body: JsonObject?, token: String?): HttpResponse =
        client.post("${baseUrl.trimEnd('/')}/$path") {
            if (token != null) header("Authorization", "Bearer $token")
            if (body != null) setBody(TextContent(body.toString(), ContentType.Application.Json))
        }
}

sealed class AccountError(message: String) : Exception(message) {
    class Server(val status: Int, val serverMessage: String?) : AccountError("Account API returned $status")
}

/** Port of AccountClient.swift: GDPR export and account deletion. */
class AccountClient(private val http: ApiHttp) {
    suspend fun exportMyData(): ByteArray {
        val response = http.post("api/account-export", null)
        if (response.status.value !in 200..299) throw AccountError.Server(response.status.value, errorOf(response.bodyAsText()))
        return response.readRawBytes()
    }

    suspend fun deleteMyAccount() {
        val response = http.post("api/account-delete", buildJsonObject { put("confirm", "DELETE") })
        if (response.status.value !in 200..299) throw AccountError.Server(response.status.value, errorOf(response.bodyAsText()))
    }

    private fun errorOf(text: String): String? =
        runCatching { ContentJson.json.parseToJsonElement(text).jsonObject["error"]?.jsonPrimitive?.contentOrNull }.getOrNull()
            ?.trim()?.takeIf { it.isNotEmpty() }
}

data class TranslationVerdict(val correct: Boolean, val reason: String?)

/**
 * The AI half of translate grading (`/api/grade-translation`). Best effort:
 * any failure returns null and the caller keeps its local verdict, so a
 * vendor outage can never mark a learner wrong.
 */
class TranslationGradingClient(private val http: ApiHttp) {
    suspend fun gradeLessonTranslation(lessonId: String, questionId: String, submission: String, course: String): TranslationVerdict? =
        grade(buildJsonObject { put("lessonId", lessonId); put("questionId", questionId); put("submission", submission); put("course", course) })

    suspend fun gradePlacementTranslation(placementId: String, submission: String, course: String): TranslationVerdict? =
        grade(buildJsonObject { put("placementId", placementId); put("submission", submission); put("course", course) })

    private suspend fun grade(body: JsonObject): TranslationVerdict? {
        val response = runCatching { http.post("api/grade-translation", body) }.getOrNull() ?: return null
        if (response.status.value !in 200..299) return null
        val obj = runCatching { ContentJson.json.parseToJsonElement(response.bodyAsText()).jsonObject }.getOrNull() ?: return null
        val correct = obj["correct"]?.jsonPrimitive?.booleanOrNull ?: return null
        return TranslationVerdict(correct, obj["reason"]?.jsonPrimitive?.contentOrNull)
    }
}
