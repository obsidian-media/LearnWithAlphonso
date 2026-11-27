package com.obsidianmedia.learnwithalphonso.core.net

import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.timeout
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/**
 * The server's feature switches in `GET /api/app-config` (`features`, src/routes/api/app-config.ts). A feature is on
 * only when the server says `true`: a missing, unreadable or failed answer is off, so a switch the server has not
 * turned on is never shown. Rehearsals is the first (REHEARSALS_ENABLED).
 */
object AppConfigFeatures {
    fun rehearsals(body: String): Boolean {
        val features = runCatching { (Json.parseToJsonElement(body) as? JsonObject)?.get("features") as? JsonObject }.getOrNull() ?: return false
        return (features["rehearsals"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull == true
    }

    /** Asks the server with a client that outlives the call. True or false as the server says; null when it cannot be read. */
    suspend fun readRehearsals(client: HttpClient, apiBaseUrl: String, timeoutMs: Long = 5_000): Boolean? = try {
        val response = client.get("${apiBaseUrl.trimEnd('/')}/api/app-config") { timeout { requestTimeoutMillis = timeoutMs } }
        if (response.status.value == 200) rehearsals(response.bodyAsText()) else null
    } catch (e: CancellationException) {
        throw e
    } catch (_: Throwable) {
        null
    }

    /** One-shot form that builds its own client; the app uses [readRehearsals] with its shared one. Any failure is off. */
    suspend fun fetchRehearsals(apiBaseUrl: String, engine: HttpClientEngine, timeoutMs: Long = 5_000): Boolean {
        val client = HttpClient(engine) { expectSuccess = false; install(HttpTimeout) }
        return try { readRehearsals(client, apiBaseUrl, timeoutMs) == true } finally { client.close() }
    }
}

/**
 * The Rehearsals switch as the app reads it: re-asked once [ttlMs] has passed (the server caches app-config about as
 * long), so turning the server switch off takes effect without a restart. Unreadable means off, and is asked again next
 * time. A coroutine cancellation is never cached.
 */
class RehearsalsFlag(
    private val read: suspend () -> Boolean?,
    private val now: () -> Long = System::currentTimeMillis,
    private val ttlMs: Long = 5 * 60_000L,
) {
    private var value = false
    private var readAt: Long? = null

    suspend fun enabled(): Boolean {
        val at = readAt
        if (at != null && now() - at < ttlMs) return value
        val fresh = read()
        if (fresh == null) { value = false; readAt = null; return false }
        value = fresh
        readAt = now()
        return fresh
    }
}
