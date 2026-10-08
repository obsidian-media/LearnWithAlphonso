package com.obsidianmedia.learnwithalphonso.core.net

/** Wire models for Plan 2 (social, teams, season, duels, challenges, safety). Field names follow the RPC rows. */

data class LeaderboardRow(val userId: String, val displayName: String, val country: String?, val avatarSeed: String, val xp: Int)

data class FriendProgress(val userId: String, val displayName: String, val avatarSeed: String, val streak: Int, val weekXp: Int)

/** One `friend_activity_events` row; the payload union is flattened, only the fields for `eventType` are non-null. */
data class FriendActivityEvent(
    val id: String,
    val userId: String,
    val eventType: String,
    val createdAtMillis: Long,
    val lessonId: String? = null,
    val xpGain: Int? = null,
    val streak: Int? = null,
    val newTier: String? = null,
)

data class Nudge(val id: String, val senderId: String, val createdAtMillis: Long)

/** `status` is pending, active, declined or completed. */
data class Duel(
    val duelId: String,
    val challengerId: String,
    val opponentId: String,
    val course: String,
    val status: String,
    val challengerXpStart: Int,
    val opponentXpStart: Int,
    val challengerXpNow: Int,
    val opponentXpNow: Int,
    val winnerId: String?,
    val endsAt: String?,
)

data class WeeklyChallenge(val templateId: String, val title: String, val description: String, val progress: Int, val threshold: Int, val completed: Boolean)

data class TeamLeaderboardRow(val teamId: String, val name: String, val weeklyXp: Int)

data class MyTeam(
    val teamId: String,
    val name: String,
    val joinCode: String,
    val joinedAtMillis: Long,
    val switchLockedUntilMillis: Long,
    val thisWeekXp: Int,
    val isOwner: Boolean,
)

/** [isBlocked] is only ever true in the owner's list: members the owner blocked, shown so they can be removed. */
data class TeamMember(
    val userId: String,
    val displayName: String,
    val avatarSeed: String,
    val joinedAtMillis: Long,
    val isOwner: Boolean,
    val isBlocked: Boolean = false,
)

data class SeasonLastWeekResult(val division: Int, val rankInCohort: Int, val cohortSize: Int)

data class SeasonStatus(val division: Int, val rankInCohort: Int, val cohortSize: Int, val lastWeekResult: SeasonLastWeekResult?)

data class ProfileIdentity(val displayName: String, val avatarSeed: String)

data class WeaknessTrendEntry(val category: String, val detectedCount: Int, val resolvedCount: Int, val openCount: Int, val lastEventAt: String)

data class FriendInvitePreview(val ok: Boolean, val isSelf: Boolean, val displayName: String?, val avatarSeed: String?)

sealed interface BuyStreakFreezeResult {
    data class Ok(val streakFreezes: Int, val xp: Int) : BuyStreakFreezeResult
    data class InsufficientXp(val streakFreezes: Int?) : BuyStreakFreezeResult
}

/** The `{ok, reason}` shape most engagement RPCs return; `reason` is server copy shown as-is. */
data class RpcOutcome(val ok: Boolean, val reason: String?)

data class TeamJoinOutcome(val ok: Boolean, val reason: String?, val teamId: String?)

data class TeamCreateOutcome(val ok: Boolean, val reason: String?, val teamId: String?, val joinCode: String?)

data class DuelCreateOutcome(val ok: Boolean, val reason: String?, val duelId: String?)

data class QuestClaimOutcome(val ok: Boolean, val reason: String?, val xp: Int?)
