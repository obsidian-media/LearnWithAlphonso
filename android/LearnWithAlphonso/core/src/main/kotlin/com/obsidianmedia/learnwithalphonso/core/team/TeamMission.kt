package com.obsidianmedia.learnwithalphonso.core.team

import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeParseException
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * A team's weekly shared mission (docs/superpowers/specs/2026-10-06-study-together-design.md, Part 1). The server
 * computes everything in `get_team_mission()`; this module only turns its row into a view model and owns the wording,
 * which is word-for-word the web card's (src/lib/team-mission.ts) and pinned by the shared fixtures
 * (core/src/test/resources/team-mission.fixtures.json, a byte-for-byte copy guarded on the web side).
 */
enum class TeamMissionStatus(val wire: String) {
    NEEDS_MEMBERS("needs_members"),
    IN_PROGRESS("in_progress"),
    COMPLETE("complete"),
    ;

    companion object {
        /** A status from a newer server that this build does not know is shown as in progress, never a crash. */
        fun fromWire(value: String?): TeamMissionStatus = entries.firstOrNull { it.wire == value } ?: IN_PROGRESS
    }
}

data class TeamMission(
    val teamId: String,
    val weekStart: String,
    val weekEnd: String,
    val target: Int,
    val total: Int,
    val myCount: Int,
    val memberCount: Int,
    val status: TeamMissionStatus,
    val rewardXp: Int,
    val rewarded: Boolean,
    val daysLeft: Int,
    val percent: Int,
    val headline: String,
    val footer: String,
)

private const val DAY_MILLIS = 86_400_000.0

/**
 * Builds the view model from an already-decoded row, or null when [weekEnd] is not a real `yyyy-MM-dd` date (the
 * caller treats that as a broken server contract, not as "no team").
 */
fun buildTeamMission(
    teamId: String,
    weekStart: String,
    weekEnd: String,
    target: Int,
    total: Int,
    myCount: Int,
    memberCount: Int,
    status: String?,
    rewardXp: Int,
    rewarded: Boolean,
    nowMillis: Long,
): TeamMission? {
    val weekEndMillis = try {
        LocalDate.parse(weekEnd).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
    } catch (_: DateTimeParseException) {
        return null
    }
    val parsedStatus = TeamMissionStatus.fromWire(status)
    val daysLeft = max(0, ceil((weekEndMillis - nowMillis) / DAY_MILLIS).toInt())
    val percent = when {
        parsedStatus == TeamMissionStatus.COMPLETE -> 100
        target > 0 -> min(100, floor(total.toDouble() / target * 100).toInt())
        else -> 0
    }
    val timeLeft = if (daysLeft == 1) "Last day" else "$daysLeft days left"
    val (headline, footer) = when (parsedStatus) {
        TeamMissionStatus.NEEDS_MEMBERS -> "Invite a friend to start your team's weekly mission" to ""
        TeamMissionStatus.COMPLETE -> "Mission complete!" to "+$rewardXp XP for everyone who joined in"
        TeamMissionStatus.IN_PROGRESS -> "$total of $target lessons done" to "You added $myCount · $timeLeft"
    }
    return TeamMission(
        teamId = teamId, weekStart = weekStart, weekEnd = weekEnd, target = target, total = total, myCount = myCount,
        memberCount = memberCount, status = parsedStatus, rewardXp = rewardXp, rewarded = rewarded,
        daysLeft = daysLeft, percent = percent, headline = headline, footer = footer,
    )
}
