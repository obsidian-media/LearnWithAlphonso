package com.obsidianmedia.learnwithalphonso.core.net

import io.ktor.client.HttpClient
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Which id this app gives RevenueCat (`Purchases.logIn`). The server (`GET /api/subscription-login`) answers with the
 * account's separate subscription identifier, which is never shown anywhere, or with the account id for an account
 * whose purchases were made on a build from before the identifier existed. The server accepts purchases under either
 * id, so any failure falls back to the account id (what every earlier build used) and never hides Pro.
 * Same rules as iOS (SubscriptionLogin.swift).
 */
object SubscriptionLogin {
    private val SUBSCRIPTION_ID = Regex("^sub_[0-9a-f]{32}$")

    /** Only the account id itself or a well-formed subscription identifier is ever used. */
    fun acceptable(candidate: String, accountId: String): Boolean = candidate == accountId || SUBSCRIPTION_ID.matches(candidate)

    suspend fun resolve(apiBaseUrl: String, accountId: String, accessToken: String?, engine: HttpClientEngine, timeoutMs: Long = 8_000): String {
        if (accessToken == null) return accountId
        val client = HttpClient(engine) {
            expectSuccess = false
            install(HttpTimeout) { requestTimeoutMillis = timeoutMs }
        }
        return try {
            val response = client.get("${apiBaseUrl.trimEnd('/')}/api/subscription-login") { header("Authorization", "Bearer $accessToken") }
            if (response.status.value != 200) return accountId
            val id = ((Json.parseToJsonElement(response.bodyAsText()) as? JsonObject)?.get("appUserId") as? JsonPrimitive)
                ?.takeIf { it.isString }?.contentOrNull
            if (id != null && acceptable(id, accountId)) id else accountId
        } catch (e: CancellationException) {
            throw e
        } catch (_: Throwable) {
            accountId
        }
    }
}
