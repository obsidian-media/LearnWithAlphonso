package com.obsidianmedia.learnwithalphonso.core.logic

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
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

private fun daysDiff(from: String, to: String): Int =
    ChronoUnit.DAYS.between(LocalDate.parse(from), LocalDate.parse(to)).toInt()

data class StreakInput(
    val lastActiveDate: String?,
    val today: String,
    val streak: Int,
    val longestStreak: Int,
    val freezes: Int,
)

data class StreakResult(val streak: Int, val longestStreak: Int, val freezes: Int)

fun computeStreakUpdate(input: StreakInput): StreakResult {
    var streak = input.streak
    var freezes = input.freezes
    val last = input.lastActiveDate

    if (last == input.today) {
        // same day, no change
    } else if (last.isNullOrEmpty()) {
        streak = 1
    } else {
        val diff = daysDiff(last, input.today)
        streak = when {
            diff == 1 -> input.streak + 1
            diff == 2 && freezes > 0 -> {
                freezes -= 1
                input.streak + 1
            }
            else -> 1
        }
    }

    if (streak > input.streak && streak % 10 == 0) freezes += 1

    return StreakResult(streak, max(input.longestStreak, streak), freezes)
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
