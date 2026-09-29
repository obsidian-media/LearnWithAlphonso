package com.obsidianmedia.learnwithalphonso.core.net

import io.ktor.http.HttpMethod
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * Plan 2 extensions of ProgressSyncClient: ports of ProgressSyncClient.swift's
 * social methods and its +Teams, +Season, +Challenges, +DisplayIdentity and
 * +SocialSafety files, one to one. Friend invites use the opaque code contract
 * main adopted on 2026-09-30, never a user id.
 */

private fun empty(): JsonObject = buildJsonObject {}

private suspend fun ProgressSyncClient.firstRow(response: io.ktor.client.statement.HttpResponse): JsonObject =
    rowsOf(response).firstOrNull() ?: throw ProgressSyncError.InvalidPayload()

private fun JsonObject.millis(client: ProgressSyncClient, key: String): Long? =
    with(client) { this@millis.string(key) }?.let { ProgressSyncClient.parsePostgresTimestampMillis(it) }?.toLong()

// ---- leaderboard ----

suspend fun ProgressSyncClient.fetchLeaderboard(scope: String, period: String): List<LeaderboardRow> =
    rowsOf(http.rpc("get_leaderboard", buildJsonObject { put("_scope", scope); put("_period", period) })).mapNotNull { row ->
        LeaderboardRow(
            userId = row.string("user_id") ?: return@mapNotNull null,
            displayName = row.string("display_name") ?: return@mapNotNull null,
            country = row.string("country"),
            avatarSeed = row.string("avatar_seed") ?: return@mapNotNull null,
            xp = row.int("xp") ?: return@mapNotNull null,
        )
    }

/** Sum of xp_earned over [from, to) days, for the weekly recap. */
suspend fun ProgressSyncClient.fetchActivityXp(userId: String, from: String, to: String): Int =
    rowsOf(
        http.rest(
            HttpMethod.Get, "activity_days",
            mapOf("select" to "xp_earned", "user_id" to "eq.$userId"),
            queryList = listOf("day" to "gte.$from", "day" to "lt.$to"),
        ),
    ).sumOf { it.int("xp_earned") ?: 0 }

// ---- friends ----

suspend fun ProgressSyncClient.getMyFriendCode(): String? =
    rowsOf(http.rpc("get_or_create_my_friend_code", empty())).firstOrNull()?.string("code")

suspend fun ProgressSyncClient.acceptFriendInvite(code: String): Pair<Boolean, String> {
    val row = firstRow(http.rpc("accept_friend_invite", buildJsonObject { put("_code", code) }))
    return (row.bool("ok") ?: throw ProgressSyncError.InvalidPayload()) to (row.string("message") ?: throw ProgressSyncError.InvalidPayload())
}

suspend fun ProgressSyncClient.getFriendInvitePreview(code: String): FriendInvitePreview {
    val row = rowsOf(http.rpc("get_friend_invite_preview", buildJsonObject { put("_code", code) })).firstOrNull()
        ?: return FriendInvitePreview(false, false, null, null)
    return FriendInvitePreview(row.bool("ok") ?: false, row.bool("is_self") ?: false, row.string("display_name"), row.string("avatar_seed"))
}

suspend fun ProgressSyncClient.removeFriend(friendId: String): Pair<Boolean, String> {
    val row = firstRow(http.rpc("remove_friend", buildJsonObject { put("_friend_id", friendId) }))
    return (row.bool("ok") ?: throw ProgressSyncError.InvalidPayload()) to (row.string("message") ?: throw ProgressSyncError.InvalidPayload())
}

suspend fun ProgressSyncClient.fetchFriendsProgress(): List<FriendProgress> =
    rowsOf(http.rpc("get_friends_progress", empty())).mapNotNull { row ->
        FriendProgress(
            userId = row.string("user_id") ?: return@mapNotNull null,
            displayName = row.string("display_name") ?: return@mapNotNull null,
            avatarSeed = row.string("avatar_seed") ?: return@mapNotNull null,
            streak = row.int("streak") ?: return@mapNotNull null,
            weekXp = row.int("week_xp") ?: return@mapNotNull null,
        )
    }

suspend fun ProgressSyncClient.fetchFriendActivity(): List<FriendActivityEvent> =
    rowsOf(
        http.rest(HttpMethod.Get, "friend_activity_events", mapOf("select" to "id,user_id,event_type,payload,created_at", "order" to "created_at.desc", "limit" to "50")),
    ).mapNotNull { row ->
        val payload = row["payload"]?.let { runCatching { it.jsonObject }.getOrNull() } ?: JsonObject(emptyMap())
        FriendActivityEvent(
            id = row.string("id") ?: return@mapNotNull null,
            userId = row.string("user_id") ?: return@mapNotNull null,
            eventType = row.string("event_type") ?: return@mapNotNull null,
            createdAtMillis = row.millis(this, "created_at") ?: return@mapNotNull null,
            lessonId = payload.string("lessonId"),
            xpGain = payload.int("xpGain"),
            streak = payload.int("streak"),
            newTier = payload.string("newTier"),
        )
    }

suspend fun ProgressSyncClient.sendNudge(recipientId: String) {
    http.requireSuccess(
        http.rest(HttpMethod.Post, "nudges", body = buildJsonObject { put("recipient_id", recipientId) }, headers = mapOf("Prefer" to "return=minimal")),
    )
}

suspend fun ProgressSyncClient.fetchUnreadNudges(): List<Nudge> =
    rowsOf(http.rest(HttpMethod.Get, "nudges", mapOf("select" to "id,sender_id,created_at", "read_at" to "is.null", "order" to "created_at.desc"))).mapNotNull { row ->
        Nudge(
            id = row.string("id") ?: return@mapNotNull null,
            senderId = row.string("sender_id") ?: return@mapNotNull null,
            createdAtMillis = row.millis(this, "created_at") ?: return@mapNotNull null,
        )
    }

suspend fun ProgressSyncClient.markNudgesRead(ids: List<String>) {
    if (ids.isEmpty()) return
    val now = DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(nowMillis()).atOffset(ZoneOffset.UTC))
    http.requireSuccess(
        http.rest(
            HttpMethod.Patch, "nudges", mapOf("id" to "in.(${ids.joinToString(",")})"),
            body = buildJsonObject { put("read_at", now) }, headers = mapOf("Prefer" to "return=minimal"),
        ),
    )
}

// ---- engagement ----

suspend fun ProgressSyncClient.buyStreakFreezeWithXp(course: String): BuyStreakFreezeResult {
    val row = firstRow(http.rpc("buy_streak_freeze_with_xp", buildJsonObject { put("_course", course) }))
    val ok = row.bool("ok") ?: throw ProgressSyncError.InvalidPayload()
    return if (ok) BuyStreakFreezeResult.Ok(row.int("streak_freezes") ?: 0, row.int("xp") ?: 0) else BuyStreakFreezeResult.InsufficientXp(row.int("streak_freezes"))
}

suspend fun ProgressSyncClient.createDuel(opponentId: String, course: String): DuelCreateOutcome {
    val row = firstRow(http.rpc("create_duel", buildJsonObject { put("_opponent_id", opponentId); put("_course", course) }))
    return DuelCreateOutcome(row.bool("ok") ?: throw ProgressSyncError.InvalidPayload(), row.string("reason"), row.string("duel_id"))
}

suspend fun ProgressSyncClient.respondToDuel(duelId: String, accept: Boolean): RpcOutcome {
    val row = firstRow(http.rpc("respond_to_duel", buildJsonObject { put("_duel_id", duelId); put("_accept", accept) }))
    return RpcOutcome(row.bool("ok") ?: throw ProgressSyncError.InvalidPayload(), row.string("reason"))
}

suspend fun ProgressSyncClient.fetchMyDuels(): List<Duel> =
    rowsOf(http.rpc("get_my_duels", empty())).mapNotNull { row ->
        Duel(
            duelId = row.string("duel_id") ?: return@mapNotNull null,
            challengerId = row.string("challenger_id") ?: return@mapNotNull null,
            opponentId = row.string("opponent_id") ?: return@mapNotNull null,
            course = row.string("course") ?: return@mapNotNull null,
            status = row.string("status") ?: return@mapNotNull null,
            challengerXpStart = row.int("challenger_xp_start") ?: 0,
            opponentXpStart = row.int("opponent_xp_start") ?: 0,
            challengerXpNow = row.int("challenger_xp_now") ?: 0,
            opponentXpNow = row.int("opponent_xp_now") ?: 0,
            winnerId = row.string("winner_id"),
            endsAt = row.string("ends_at"),
        )
    }

suspend fun ProgressSyncClient.joinOpenDuelQueue(course: String, matchByLevel: Boolean): Pair<Boolean, String?> {
    val row = firstRow(http.rpc("join_open_duel_queue", buildJsonObject { put("_course", course); put("_match_by_level", matchByLevel) }))
    return (row.bool("matched") ?: throw ProgressSyncError.InvalidPayload()) to row.string("duel_id")
}

suspend fun ProgressSyncClient.leaveOpenDuelQueue() {
    http.requireSuccess(http.rpc("leave_duel_queue", empty()))
}

suspend fun ProgressSyncClient.getWeeklyChallenges(): List<WeeklyChallenge> =
    rowsOf(http.rpc("get_weekly_challenges", empty())).mapNotNull { row ->
        WeeklyChallenge(
            templateId = row.string("template_id") ?: return@mapNotNull null,
            title = row.string("title") ?: return@mapNotNull null,
            description = row.string("description") ?: return@mapNotNull null,
            progress = row.int("progress") ?: return@mapNotNull null,
            threshold = row.int("threshold") ?: return@mapNotNull null,
            completed = row.bool("completed") ?: return@mapNotNull null,
        )
    }

suspend fun ProgressSyncClient.claimWeeklyQuest(questId: String, course: String, weekStart: String): QuestClaimOutcome {
    val row = firstRow(http.rpc("claim_weekly_quest", buildJsonObject { put("_quest_id", questId); put("_course", course); put("_week_start", weekStart) }))
    return QuestClaimOutcome(row.bool("ok") ?: throw ProgressSyncError.InvalidPayload(), row.string("reason"), row.int("xp"))
}

// ---- teams ----

suspend fun ProgressSyncClient.getTeamLeaderboard(): List<TeamLeaderboardRow> =
    rowsOf(http.rpc("get_team_leaderboard", empty())).mapNotNull { row ->
        TeamLeaderboardRow(row.string("team_id") ?: return@mapNotNull null, row.string("name") ?: return@mapNotNull null, row.int("weekly_xp") ?: return@mapNotNull null)
    }

/** Null when the learner has no team, or the row is missing a required field (same fail-safe as iOS). */
suspend fun ProgressSyncClient.getMyTeam(): MyTeam? {
    val row = rowsOf(http.rpc("get_my_team", empty())).firstOrNull() ?: return null
    return MyTeam(
        teamId = row.string("team_id") ?: return null,
        name = row.string("name") ?: return null,
        joinCode = row.string("join_code") ?: return null,
        joinedAtMillis = row.millis(this, "joined_at") ?: return null,
        switchLockedUntilMillis = row.millis(this, "switch_locked_until") ?: return null,
        thisWeekXp = row.int("this_week_xp") ?: return null,
        isOwner = row.bool("is_owner") ?: false,
    )
}

suspend fun ProgressSyncClient.getTeamMembers(): List<TeamMember> =
    rowsOf(http.rpc("get_team_members", empty())).mapNotNull { row ->
        TeamMember(
            userId = row.string("user_id") ?: return@mapNotNull null,
            displayName = row.string("display_name") ?: return@mapNotNull null,
            avatarSeed = row.string("avatar_seed") ?: return@mapNotNull null,
            joinedAtMillis = row.millis(this, "joined_at") ?: return@mapNotNull null,
            isOwner = row.bool("is_owner") ?: false,
        )
    }

suspend fun ProgressSyncClient.kickTeamMember(userId: String): RpcOutcome {
    val row = firstRow(http.rpc("kick_team_member", buildJsonObject { put("_user_id", userId) }))
    return RpcOutcome(row.bool("ok") ?: throw ProgressSyncError.InvalidPayload(), row.string("reason"))
}

private suspend fun ProgressSyncClient.teamJoin(rpc: String, body: JsonObject): TeamJoinOutcome {
    val row = firstRow(http.rpc(rpc, body))
    return TeamJoinOutcome(row.bool("ok") ?: throw ProgressSyncError.InvalidPayload(), row.string("reason"), row.string("team_id"))
}

suspend fun ProgressSyncClient.joinTeamByCode(code: String): TeamJoinOutcome = teamJoin("join_team", buildJsonObject { put("_code", code) })

suspend fun ProgressSyncClient.autoJoinTeam(): TeamJoinOutcome = teamJoin("auto_join_team", empty())

suspend fun ProgressSyncClient.createTeam(name: String, visibility: String = "public"): TeamCreateOutcome {
    val row = firstRow(http.rpc("create_team", buildJsonObject { put("_name", name); put("_visibility", visibility) }))
    return TeamCreateOutcome(row.bool("ok") ?: throw ProgressSyncError.InvalidPayload(), row.string("reason"), row.string("team_id"), row.string("join_code"))
}

suspend fun ProgressSyncClient.leaveTeam(): RpcOutcome {
    val row = firstRow(http.rpc("leave_team", empty()))
    return RpcOutcome(row.bool("ok") ?: throw ProgressSyncError.InvalidPayload(), row.string("reason"))
}

// ---- season ----

suspend fun ProgressSyncClient.getSeasonStatus(): SeasonStatus? {
    val obj = objectOf(http.function("get-season-status", null, HttpMethod.Get))
    val division = obj.int("division") ?: return null
    val rank = obj.int("rankInCohort") ?: return null
    val size = obj.int("cohortSize") ?: return null
    val lastWeek = obj["lastWeekResult"]?.let { runCatching { it.jsonObject }.getOrNull() }?.let { lw ->
        val d = lw.int("division") ?: return@let null
        val r = lw.int("rankInCohort") ?: return@let null
        val s = lw.int("cohortSize") ?: return@let null
        SeasonLastWeekResult(d, r, s)
    }
    return SeasonStatus(division, rank, size, lastWeek)
}

// ---- identity ----

suspend fun ProgressSyncClient.fetchProfileIdentity(userId: String): ProfileIdentity? {
    val row = rowsOf(http.rest(HttpMethod.Get, "profiles", mapOf("select" to "display_name,avatar_seed", "id" to "eq.$userId"))).firstOrNull() ?: return null
    return ProfileIdentity(row.string("display_name") ?: return null, row.string("avatar_seed") ?: return null)
}

suspend fun ProgressSyncClient.updateProfileDisplayName(displayName: String, userId: String) {
    http.requireSuccess(http.rest(HttpMethod.Patch, "profiles", mapOf("id" to "eq.$userId"), body = buildJsonObject { put("display_name", displayName) }, headers = mapOf("Prefer" to "return=minimal")))
}

suspend fun ProgressSyncClient.updateProfileAvatarSeed(avatarSeed: String, userId: String) {
    http.requireSuccess(http.rest(HttpMethod.Patch, "profiles", mapOf("id" to "eq.$userId"), body = buildJsonObject { put("avatar_seed", avatarSeed) }, headers = mapOf("Prefer" to "return=minimal")))
}

// ---- safety ----

suspend fun ProgressSyncClient.blockUser(userId: String): Pair<Boolean, String> {
    val row = firstRow(http.rpc("block_user", buildJsonObject { put("_target", userId) }))
    return (row.bool("ok") ?: throw ProgressSyncError.InvalidPayload()) to (row.string("message") ?: throw ProgressSyncError.InvalidPayload())
}

suspend fun ProgressSyncClient.unblockUser(userId: String) {
    http.requireSuccess(http.rest(HttpMethod.Delete, "blocked_users", mapOf("blocked" to "eq.$userId"), headers = mapOf("Prefer" to "return=minimal")))
}

suspend fun ProgressSyncClient.reportUser(userId: String, reason: String) {
    http.requireSuccess(http.rest(HttpMethod.Post, "content_reports", body = buildJsonObject { put("reported", userId); put("reason", reason) }, headers = mapOf("Prefer" to "return=minimal")))
}

// ---- weakness trend ----

/** Aggregates weakness_events per category; open first, then most recent. Port of fetchWeaknessTrend. */
suspend fun ProgressSyncClient.fetchWeaknessTrend(): List<WeaknessTrendEntry> {
    val rows = rowsOf(http.rest(HttpMethod.Get, "weakness_events", mapOf("select" to "category,event_type,created_at", "order" to "created_at.asc")))
    data class Acc(var detected: Int, var resolved: Int, var last: String)
    val order = ArrayList<String>()
    val byCategory = HashMap<String, Acc>()
    for (row in rows) {
        val category = row.string("category") ?: continue
        val type = row.string("event_type") ?: continue
        val created = row.string("created_at") ?: continue
        val acc = byCategory.getOrPut(category) { order.add(category); Acc(0, 0, created) }
        if (type == "detected") acc.detected++ else acc.resolved++
        acc.last = created
    }
    return order.map { c ->
        val v = byCategory.getValue(c)
        WeaknessTrendEntry(c, v.detected, v.resolved, maxOf(0, v.detected - v.resolved), v.last)
    }.sortedWith(compareByDescending<WeaknessTrendEntry> { it.openCount }.thenByDescending { it.lastEventAt })
}
