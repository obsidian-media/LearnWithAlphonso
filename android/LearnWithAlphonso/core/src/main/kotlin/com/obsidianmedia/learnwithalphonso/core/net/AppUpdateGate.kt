package com.obsidianmedia.learnwithalphonso.core.net

import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull

/**
 * The "Please update" gate. The server (`GET /api/app-config`, src/lib/app-update-gate.ts) names the lowest Android
 * versionCode it still supports; a build below it shows the update screen instead of the app.
 *
 * Off by default (no minimum set). Anything that goes wrong (offline, a timeout, an unreadable answer) opens the app
 * normally: a server problem must never lock anyone out. Keep in step with the web and iOS (AppUpdateGate.swift) copies.
 */
object AppUpdateGate {
    data class Requirement(val storeUrl: String?)

    /** True only for a known build strictly below a set minimum. */
    fun needsUpdate(currentVersionCode: Int?, minVersionCode: Int?): Boolean {
        if (currentVersionCode == null || minVersionCode == null || minVersionCode <= 0) return false
        return currentVersionCode < minVersionCode
    }

    /** What the server's answer means for this build: a requirement to update, or null (open the app). */
    fun requirement(body: String, currentVersionCode: Int?): Requirement? {
        val android = runCatching { Json.parseToJsonElement(body) as? JsonObject }.getOrNull()?.get("android") as? JsonObject
            ?: return null
        val min = (android["minBuild"] as? JsonPrimitive)?.takeIf { !it.isString }?.longOrNull
            ?.takeIf { it in 1..Int.MAX_VALUE.toLong() }?.toInt()
        if (!needsUpdate(currentVersionCode, min)) return null
        val store = (android["storeUrl"] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
            ?.takeIf { it.startsWith("https://") }
        return Requirement(store)
    }

    /** Asks the server. Never throws (except a cancellation): any failure is null (open the app). */
    suspend fun check(apiBaseUrl: String, currentVersionCode: Int?, engine: HttpClientEngine, timeoutMs: Long = 5_000): Requirement? {
        if (currentVersionCode == null) return null
        val client = HttpClient(engine) {
            expectSuccess = false
            install(HttpTimeout) { requestTimeoutMillis = timeoutMs }
        }
        return try {
            val response = client.get("${apiBaseUrl.trimEnd('/')}/api/app-config")
            if (response.status.value != 200) null else requirement(response.bodyAsText(), currentVersionCode)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            null
        }
    }
}
