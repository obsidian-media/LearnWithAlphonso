package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.team.TeamMission
import com.obsidianmedia.learnwithalphonso.core.team.buildTeamMission
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject

/**
 * The caller's team mission for the current week (the `get_team_mission` RPC), or null when they have no team. The
 * server resolves any payout as a side effect of this read, so call it when the card appears, never in a tight loop.
 * The time defaults to the client's own injected clock, so tests and production share one source of time.
 *
 * A server error or a row that does not decode THROWS: it must not look like "no team", which would hide a broken
 * contract behind a missing card.
 */
suspend fun ProgressSyncClient.getTeamMission(nowMillis: Long = this.nowMillis()): TeamMission? {
    val row: JsonObject = rowsOf(http.rpc("get_team_mission", buildJsonObject {})).firstOrNull() ?: return null
    return buildTeamMission(
        teamId = row.string("team_id") ?: throw ProgressSyncError.InvalidPayload(),
        weekStart = row.string("week_start") ?: throw ProgressSyncError.InvalidPayload(),
        weekEnd = row.string("week_end") ?: throw ProgressSyncError.InvalidPayload(),
        target = row.int("target") ?: throw ProgressSyncError.InvalidPayload(),
        total = row.int("total") ?: throw ProgressSyncError.InvalidPayload(),
        myCount = row.int("my_count") ?: throw ProgressSyncError.InvalidPayload(),
        memberCount = row.int("member_count") ?: throw ProgressSyncError.InvalidPayload(),
        status = row.string("status"),
        rewardXp = row.int("reward_xp") ?: throw ProgressSyncError.InvalidPayload(),
        rewarded = row.bool("rewarded") ?: throw ProgressSyncError.InvalidPayload(),
        nowMillis = nowMillis,
    ) ?: throw ProgressSyncError.InvalidPayload()
}
