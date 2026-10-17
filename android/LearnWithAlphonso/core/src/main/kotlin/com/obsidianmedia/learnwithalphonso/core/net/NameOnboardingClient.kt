package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.put

/**
 * The learner's own public name and whether they have chosen it. Read through `get_my_name_status`, a definer
 * function, so it does not depend on profiles' SELECT policy. `nameConfirmed` is decided by the column holding a
 * value, so an unfamiliar timestamp format never sends a learner back to the prompt.
 */
data class NameStatus(val displayName: String, val nameConfirmed: Boolean) {
    val needsPrompt: Boolean get() = !nameConfirmed
}

/** Null when the profile row does not exist (no rows); callers treat that like a failed check and skip the prompt this launch. */
suspend fun ProgressSyncClient.fetchNameStatus(): NameStatus? {
    val text = http.requireSuccess(http.rpc("get_my_name_status", buildJsonObject {}))
    val rows = runCatching { ContentJson.json.parseToJsonElement(text).jsonArray }.getOrNull() ?: throw ProgressSyncError.InvalidPayload()
    val row = rows.firstOrNull()?.let { it as? JsonObject } ?: return null
    val name = (row["display_name"] as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return null
    val confirmedAt = row["name_confirmed_at"]
    return NameStatus(name, nameConfirmed = confirmedAt != null && confirmedAt !is JsonNull)
}

/** The server filter's verdict without saving: null (allowed), "invalid-name" or "blocked-content". */
suspend fun ProgressSyncClient.displayNameProblem(name: String): String? {
    val text = http.requireSuccess(http.rpc("display_name_problem", buildJsonObject { put("_name", name) }))
    if (text.isBlank()) return null
    val value = runCatching { ContentJson.json.parseToJsonElement(text) }.getOrNull() ?: throw ProgressSyncError.InvalidPayload()
    if (value is JsonNull) return null
    val primitive = value as? JsonPrimitive ?: throw ProgressSyncError.InvalidPayload()
    if (!primitive.isString) throw ProgressSyncError.InvalidPayload()
    return primitive.content
}

/**
 * `confirm_display_name`: the validated way to set the public name. Stores the cleaned name, stamps
 * `name_confirmed_at` and returns what was stored. A refused name throws [ProgressSyncError.Server] whose message is
 * the code ("blocked-content" or "invalid-name").
 */
suspend fun ProgressSyncClient.confirmDisplayName(name: String): String = storedName(http.rpc("confirm_display_name", buildJsonObject { put("_name", name) }))

/** "Skip" on the prompt: keeps a clean Learner-XXXX handle or stores a new one, stamps the confirmation, returns the stored name. */
suspend fun ProgressSyncClient.skipDisplayNamePrompt(): String = storedName(http.rpc("skip_display_name_prompt", buildJsonObject {}))

private suspend fun ProgressSyncClient.storedName(response: io.ktor.client.statement.HttpResponse): String {
    val text = http.requireSuccess(response)
    val value = runCatching { ContentJson.json.parseToJsonElement(text) }.getOrNull() as? JsonPrimitive
    if (value == null || !value.isString) throw ProgressSyncError.InvalidPayload()
    return value.content
}
