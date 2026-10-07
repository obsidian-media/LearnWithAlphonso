package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.buddy.BuddyRequest
import com.obsidianmedia.learnwithalphonso.core.buddy.MyBuddy
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Study buddies (`get_my_buddy`, `get_buddy_requests`, `request_buddy`, `respond_buddy_request`, `cancel_buddy_request`,
 * `end_buddy`). Every call THROWS on a server error or a row that does not decode, so a failed lookup is never shown as
 * "no buddy" (the Teams screens did that and it hid broken team functions, PR #237). A mutation returns the server's
 * status (see BuddyCopy.statusMessage), or "unknown" when the server returned no row.
 */
suspend fun ProgressSyncClient.getMyBuddy(): MyBuddy? {
    val row: JsonObject = rowsOf(http.rpc("get_my_buddy", buildJsonObject {})).firstOrNull() ?: return null
    fun bad(): Nothing = throw ProgressSyncError.InvalidPayload()
    return MyBuddy(
        pairId = row.string("pair_id") ?: bad(),
        buddyId = row.string("buddy_id") ?: bad(),
        buddyName = row.string("buddy_name") ?: bad(),
        buddyAvatarSeed = row.string("buddy_avatar_seed") ?: bad(),
        pairedAt = row.string("paired_at") ?: bad(),
        weekStart = row.string("week_start") ?: bad(),
        myCount = row.int("my_count") ?: bad(),
        buddyCount = row.int("buddy_count") ?: bad(),
        goal = row.int("goal") ?: bad(),
        streakWeeks = row.int("streak_weeks") ?: bad(),
        graceAvailable = row.bool("grace_available") ?: bad(),
        // Required key: a string, or JSON null before the pair's first judged week. Anything else is a broken row.
        lastOutcome = when (val outcome = row["last_outcome"]) {
            null -> bad()
            is JsonNull -> null
            is JsonPrimitive -> if (outcome.isString) outcome.content else bad()
            else -> bad()
        },
    )
}

suspend fun ProgressSyncClient.getBuddyRequests(): List<BuddyRequest> =
    rowsOf(http.rpc("get_buddy_requests", buildJsonObject {})).map { row ->
        fun bad(): Nothing = throw ProgressSyncError.InvalidPayload()
        BuddyRequest(
            requestId = row.string("request_id") ?: bad(),
            direction = when (row.string("direction")) {
                "incoming" -> BuddyRequest.Direction.INCOMING
                "outgoing" -> BuddyRequest.Direction.OUTGOING
                else -> bad()
            },
            otherId = row.string("other_id") ?: bad(),
            otherName = row.string("other_name") ?: bad(),
            otherAvatarSeed = row.string("other_avatar_seed") ?: bad(),
            requestedAt = row.string("requested_at") ?: bad(),
        )
    }

suspend fun ProgressSyncClient.requestBuddy(friendId: String): String =
    buddyStatus("request_buddy", buildJsonObject { put("_friend", friendId) })

suspend fun ProgressSyncClient.respondBuddyRequest(requestId: String, accept: Boolean): String =
    buddyStatus("respond_buddy_request", buildJsonObject { put("_request", requestId); put("_accept", accept) })

suspend fun ProgressSyncClient.cancelBuddyRequest(requestId: String): String =
    buddyStatus("cancel_buddy_request", buildJsonObject { put("_request", requestId) })

suspend fun ProgressSyncClient.endBuddy(): String = buddyStatus("end_buddy", buildJsonObject {})

private suspend fun ProgressSyncClient.buddyStatus(function: String, body: JsonObject): String =
    rowsOf(http.rpc(function, body)).firstOrNull()?.string("status") ?: "unknown"
