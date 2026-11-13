package com.obsidianmedia.learnwithalphonso.core.logic

import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.time.Instant
import java.time.ZoneOffset

/**
 * The learner's daily Hector allowance (BACKLOG 0.0-bq #5), read before Hector greets so a learner who has used it
 * up sees the "out for today" message instead of one more cached greeting.
 *
 * There is no status endpoint: `consume_ai_quota` keeps one `ai_usage` row per user, day and kind, and the learner may
 * read their own rows. The day is the UTC date (the function keys on `current_date` on a UTC database), and the call
 * that would take the count past the limit is the one refused, so the allowance is used up once the count has reached
 * it. Fails open: a failed read leaves the greeting as before, because the server still refuses the turn.
 *
 * The limit is NOT a constant here: the server says it (`GET /api/app-config`, `limits.hectorDaily`) and no client holds a
 * copy. With no limit known the allowance is never "used up" (fail open).
 *
 * Port of src/lib/hector-allowance.ts and HectorAllowance.swift; keep the three in step.
 */
object HectorAllowance {
    /** The limit in an `/api/app-config` answer: a positive whole number, or null. */
    fun limit(body: String): Int? {
        val limits = (runCatching { Json.parseToJsonElement(body) as? JsonObject }.getOrNull()?.get("limits") as? JsonObject) ?: return null
        val n = (limits["hectorDaily"] as? JsonPrimitive)?.takeIf { !it.isString }?.longOrNull ?: return null
        return n.takeIf { it in 1..Int.MAX_VALUE.toLong() }?.toInt()
    }

    /** Asks the server for the limit. Never throws (except a cancellation): any failure is null (fail open). */
    suspend fun fetchLimit(apiBaseUrl: String, engine: HttpClientEngine, timeoutMs: Long = 5_000): Int? {
        val client = HttpClient(engine) {
            expectSuccess = false
            install(HttpTimeout) { requestTimeoutMillis = timeoutMs }
        }
        return try {
            val response = client.get("${apiBaseUrl.trimEnd('/')}/api/app-config")
            if (response.status.value != 200) null else limit(response.bodyAsText())
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            null
        }
    }

    /** The words the server's own quota refusal shows (AiErrorCopy.quotaExceededMessage carries the same). */
    const val OUT_FOR_TODAY = "You've reached today's AI practice limit. Try again tomorrow."

    /** consume_ai_quota keys on the UTC date. */
    fun utcDay(nowMillis: Long): String = Instant.ofEpochMilli(nowMillis).atZone(ZoneOffset.UTC).toLocalDate().toString()

    /** True when any of today's counts has reached the limit; no row, or no known limit, never locks the learner out. */
    fun isUsedUp(counts: List<Int>, limit: Int?): Boolean = limit != null && counts.any { it >= limit }
}
