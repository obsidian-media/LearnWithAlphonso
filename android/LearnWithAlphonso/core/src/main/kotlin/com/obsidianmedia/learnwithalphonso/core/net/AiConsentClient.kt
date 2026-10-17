package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Account-level AI consent (`profiles.ai_consent_at`), read and written only through the `get_ai_consent` /
 * `set_ai_consent` RPCs, the same calls as ProgressSyncClient+AIConsent.swift. A direct PATCH of the column is refused
 * by a trigger, so there is no other write path. Both return the stored timestamp, or null when AI is not allowed.
 */
suspend fun ProgressSyncClient.fetchAiConsent(): String? = aiConsentRpc("get_ai_consent", buildJsonObject {})

suspend fun ProgressSyncClient.setAiConsent(granted: Boolean): String? =
    aiConsentRpc("set_ai_consent", buildJsonObject { put("_granted", granted) })

private suspend fun ProgressSyncClient.aiConsentRpc(name: String, body: kotlinx.serialization.json.JsonObject): String? {
    val text = http.requireSuccess(http.rpc(name, body))
    val element = runCatching { ContentJson.json.parseToJsonElement(text) }.getOrNull() ?: throw ProgressSyncError.InvalidPayload()
    if (element is JsonNull) return null
    val primitive = element as? JsonPrimitive ?: throw ProgressSyncError.InvalidPayload()
    if (!primitive.isString || primitive.content.isBlank()) throw ProgressSyncError.InvalidPayload()
    return primitive.content
}
