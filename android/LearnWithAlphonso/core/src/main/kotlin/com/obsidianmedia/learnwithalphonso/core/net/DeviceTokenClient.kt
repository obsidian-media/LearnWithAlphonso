package com.obsidianmedia.learnwithalphonso.core.net

import io.ktor.http.HttpMethod
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Port of ProgressSyncClient.swift's registerDeviceToken and
 * unregisterDeviceToken. Row per (user, device); the server prunes a dead
 * token when a send fails, and sign-out deletes this device's own row.
 *
 * Registering goes through claim_device_token, which also removes the same
 * token from any other account: a shared phone whose previous account never
 * got to clean up stops receiving that account's nudges.
 */
suspend fun ProgressSyncClient.registerDeviceToken(token: String, platform: String = "android") {
    http.requireSuccess(
        http.rpc(
            "claim_device_token",
            buildJsonObject {
                put("_token", token)
                put("_platform", platform)
            },
        ),
    )
}

suspend fun ProgressSyncClient.unregisterDeviceToken(token: String) {
    http.requireSuccess(http.rest(HttpMethod.Delete, "device_tokens", mapOf("token" to "eq.$token"), null, mapOf("Prefer" to "return=minimal")))
}
