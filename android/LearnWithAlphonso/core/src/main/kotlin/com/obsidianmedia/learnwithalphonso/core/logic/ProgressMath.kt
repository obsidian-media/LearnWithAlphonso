package com.obsidianmedia.learnwithalphonso.core.logic

import java.time.Instant
import java.time.ZoneOffset
import kotlin.math.max

/** Port of src/lib/progress-math.ts. ProgressMathTest carries the same vectors. */

fun computeXpGain(correct: Int, total: Int): Int = correct * 10 + if (correct == total) 20 else 0

/**
 * ISO "yyyy-MM-dd" for an instant, in UTC. The server keeps last_active_date
 * as a UTC calendar date, so every streak comparison must use this and never
 * the device zone (Review Focus 3 in the plan).
 */
fun utcDateString(epochMillis: Long): String =
    Instant.ofEpochMilli(epochMillis).atZone(ZoneOffset.UTC).toLocalDate().toString()

/**
 * The learner's own calendar date, "yyyy-MM-dd", in [zone]. Streaks and days are the learner's local days (owner
 * decision 2026-11-12; the server books them in their stored zone, which the app sends from the device), so "studied
 * today" compares against this. Review due dates stay UTC dates: use [utcDateString] for those.
 */
fun localDateString(epochMillis: Long, zone: java.time.ZoneId): String =
    Instant.ofEpochMilli(epochMillis).atZone(zone).toLocalDate().toString()

data class StreakInput(
    val lastActiveDate: String?,
    val today: String,
    val streak: Int,
    val longestStreak: Int,
    val freezes: Int,
    /** The account's day_basis is still "utc": one missed day is bridged without a freeze (StreakRule). */
    val bridgeUtcDay: Boolean = false,
)

data class StreakResult(val streak: Int, val longestStreak: Int, val freezes: Int)

/** The web's signature over the one shared step, [StreakRule.next]. */
fun computeStreakUpdate(input: StreakInput): StreakResult {
    val o = StreakRule.next(input.streak, input.longestStreak, input.lastActiveDate, input.today, input.freezes, if (input.bridgeUtcDay) "utc" else "local")
    return StreakResult(o.streak, o.longestStreak, o.freezes)
}

val LEAGUES: List<String> = listOf("bronze", "silver", "sapphire", "ruby", "diamond")
val LEAGUE_THRESHOLDS: List<Int> = listOf(0, 300, 1000, 3000, 8000)

data class LeaguePromotion(val leagueTier: String, val newIdx: Int)

/** Never demotes: the new index is at least the old one. */
fun computeLeaguePromotion(xp: Int, oldIdx: Int): LeaguePromotion {
    var newIdx = oldIdx
    for (i in LEAGUES.indices.reversed()) {
        if (xp >= LEAGUE_THRESHOLDS[i]) {
            newIdx = max(oldIdx, i)
            break
        }
    }
    return LeaguePromotion(LEAGUES[newIdx], newIdx)
}

data class LessonReplayXp(val bestCorrect: Int, val bestXp: Int, val xpGain: Int)

/**
 * XP for replaying a lesson: only the improvement over the stored best pays.
 * `existing` is (correct, xpEarned) of the stored completion, or null on a
 * first completion.
 */
fun computeLessonReplayXp(existing: Pair<Int, Int>?, correct: Int, total: Int): LessonReplayXp {
    val bestCorrect = max(existing?.first ?: 0, correct)
    val bestXp = computeXpGain(bestCorrect, total)
    val xpGain = max(0, bestXp - (existing?.second ?: 0))
    return LessonReplayXp(bestCorrect, bestXp, xpGain)
}
