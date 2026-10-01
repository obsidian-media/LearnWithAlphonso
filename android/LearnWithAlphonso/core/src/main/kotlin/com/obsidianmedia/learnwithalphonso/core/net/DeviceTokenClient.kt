package com.obsidianmedia.learnwithalphonso.core.net

import io.ktor.http.HttpMethod
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import java.time.format.DateTimeFormatter

/**
 * Port of ProgressSyncClient.swift's registerDeviceToken and
 * unregisterDeviceToken. Row per (user, device); the server prunes a dead
 * token when a send fails, and sign-out deletes this device's own row.
 */
suspend fun ProgressSyncClient.registerDeviceToken(token: String, platform: String = "android") {
    http.requireSuccess(
        http.rest(
            HttpMethod.Post, "device_tokens",
            mapOf("on_conflict" to "user_id,token"),
            buildJsonObject {
                put("token", token)
                put("platform", platform)
                put("updated_at", DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(nowMillis())))
            },
            mapOf("Prefer" to "resolution=merge-duplicates,return=minimal"),
        ),
    )
}

suspend fun ProgressSyncClient.unregisterDeviceToken(token: String) {
    http.requireSuccess(http.rest(HttpMethod.Delete, "device_tokens", mapOf("token" to "eq.$token"), null, mapOf("Prefer" to "return=minimal")))
}
