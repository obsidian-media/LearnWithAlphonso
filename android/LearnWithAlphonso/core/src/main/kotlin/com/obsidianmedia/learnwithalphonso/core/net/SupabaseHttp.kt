package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.request.header
import io.ktor.client.request.parameter
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

sealed class ProgressSyncError(message: String) : Exception(message) {
    class Server(val status: Int, val serverMessage: String?) :
        ProgressSyncError("Server returned $status${serverMessage?.let { ": $it" } ?: ""}")

    class InvalidPayload : ProgressSyncError("Unexpected response shape")
}

/**
 * The one HTTP seam every Supabase call goes through: PostgREST reads and
 * writes, RPCs, and Edge Functions. Adds the `apikey` and `Authorization`
 * headers, and on a 401 asks `refresh` for a new access token once before
 * giving up. `engine` is injected so core tests use Ktor's MockEngine.
 */
class SupabaseHttp(
    val baseUrl: String,
    val anonKey: String,
    private val accessToken: suspend () -> String?,
    engine: HttpClientEngine,
    private val refresh: (suspend () -> String?)? = null,
) {
    val json: Json = ContentJson.json
    private val client = HttpClient(engine) { expectSuccess = false }

    suspend fun rest(
        method: HttpMethod,
        table: String,
        query: Map<String, String> = emptyMap(),
        body: JsonElement? = null,
        headers: Map<String, String> = emptyMap(),
    ): HttpResponse = send(method, "rest/v1/$table", query, body, headers)

    suspend fun rpc(name: String, body: JsonObject): HttpResponse =
        send(HttpMethod.Post, "rest/v1/rpc/$name", emptyMap(), body, emptyMap())

    suspend fun function(name: String, body: JsonObject): HttpResponse =
        send(HttpMethod.Post, "functions/v1/$name", emptyMap(), body, emptyMap())

    private suspend fun send(
        method: HttpMethod,
        path: String,
        query: Map<String, String>,
        body: JsonElement?,
        headers: Map<String, String>,
    ): HttpResponse {
        val first = sendOnce(method, path, query, body, headers, accessToken())
        if (first.status != HttpStatusCode.Unauthorized || refresh == null) return first
        val fresh = refresh.invoke() ?: return first
        return sendOnce(method, path, query, body, headers, fresh)
    }

    private suspend fun sendOnce(
        method: HttpMethod,
        path: String,
        query: Map<String, String>,
        body: JsonElement?,
        headers: Map<String, String>,
        token: String?,
    ): HttpResponse = client.request("${baseUrl.trimEnd('/')}/$path") {
        this.method = method
        query.forEach { (k, v) -> parameter(k, v) }
        header("apikey", anonKey)
        if (token != null) header("Authorization", "Bearer $token")
        headers.forEach { (k, v) -> header(k, v) }
        if (body != null) setBody(TextContent(body.toString(), ContentType.Application.Json))
    }

    /** Throws ProgressSyncError.Server for a non-2xx status, with PostgREST's or an Edge Function's message. */
    suspend fun requireSuccess(response: HttpResponse): String {
        val text = response.bodyAsText()
        if (response.status.value !in 200..299) {
            throw ProgressSyncError.Server(response.status.value, errorMessage(text))
        }
        return text
    }

    private fun errorMessage(text: String): String? {
        val obj = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return null
        // "message"/"msg"/"hint" are PostgREST's error shape; "error" is the Edge Functions'.
        val message = listOf("message", "msg", "hint", "error")
            .firstNotNullOfOrNull { key -> obj[key]?.let { runCatching { it.jsonPrimitive.content }.getOrNull() } }
        return message?.trim()?.takeIf { it.isNotEmpty() }
    }
}
