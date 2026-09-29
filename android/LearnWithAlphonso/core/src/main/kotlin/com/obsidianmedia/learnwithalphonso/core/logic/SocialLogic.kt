package com.obsidianmedia.learnwithalphonso.core.logic

import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneOffset

/** Pure social logic ports for Plan 2: overtake detection, avatar colour, week math, nudge cooldown. */

data class LeaderboardSnapshotEntry(val userId: String, val xp: Int)

/**
 * Port of LeaderboardEngagement.swift: true when someone who ranked below me
 * in `previous` now ranks above me in `current`. False whenever I am missing
 * from either snapshot, so a first launch never reports an overtake.
 */
fun wasOvertaken(previous: List<LeaderboardSnapshotEntry>, current: List<LeaderboardSnapshotEntry>, me: String): Boolean {
    val myPreviousRank = previous.indexOfFirst { it.userId == me }.takeIf { it >= 0 } ?: return false
    val myCurrentRank = current.indexOfFirst { it.userId == me }.takeIf { it >= 0 } ?: return false
    for ((currentRank, entry) in current.withIndex()) {
        if (entry.userId == me || currentRank >= myCurrentRank) continue
        val previousRank = previous.indexOfFirst { it.userId == entry.userId }
        if (previousRank > myPreviousRank) return true
    }
    return false
}

/** Port of AvatarColor.swift: hue from the seed's first code point, HSL(0.40, 0.45), as RGB in 0..1. */
fun avatarRgb(seed: String): Triple<Float, Float, Float> {
    val firstCodePoint = if (seed.isEmpty()) 0 else seed.codePointAt(0)
    val hue = ((firstCodePoint * 37) % 360) / 360.0
    val (r, g, b) = hslToRgb(hue, 0.40, 0.45)
    return Triple(r.toFloat(), g.toFloat(), b.toFloat())
}

private fun hslToRgb(hue: Double, saturation: Double, lightness: Double): Triple<Double, Double, Double> {
    if (saturation <= 0) return Triple(lightness, lightness, lightness)
    val q = if (lightness < 0.5) lightness * (1 + saturation) else lightness + saturation - lightness * saturation
    val p = 2 * lightness - q
    fun component(tIn: Double): Double {
        var t = tIn
        if (t < 0) t += 1
        if (t > 1) t -= 1
        return when {
            t < 1.0 / 6 -> p + (q - p) * 6 * t
            t < 1.0 / 2 -> q
            t < 2.0 / 3 -> p + (q - p) * (2.0 / 3 - t) * 6
            else -> p
        }
    }
    return Triple(component(hue + 1.0 / 3), component(hue), component(hue - 1.0 / 3))
}

/** The UTC Monday that starts the week `weeksAgo` weeks before `nowMillis`, as yyyy-MM-dd. */
fun mondayDateString(weeksAgo: Int, nowMillis: Long): String {
    val today = Instant.ofEpochMilli(nowMillis).atZone(ZoneOffset.UTC).toLocalDate()
    val daysSinceMonday = (today.dayOfWeek.value - DayOfWeek.MONDAY.value + 7) % 7
    return today.minusDays(daysSinceMonday.toLong() + weeksAgo * 7L).toString()
}

/** True when `to` is a higher league than `from`; unknown tiers never count. */
fun isLeaguePromotion(from: String, to: String): Boolean {
    val fromIdx = LEAGUES.indexOf(from)
    val toIdx = LEAGUES.indexOf(to)
    return fromIdx >= 0 && toIdx >= 0 && toIdx > fromIdx
}

object NudgeCooldown {
    const val COOLDOWN_MS: Long = 24L * 60 * 60 * 1000

    /** One nudge per friend per 24 hours; never nudged means allowed. */
    fun canNudge(lastNudgedAtMillis: Long?, nowMillis: Long): Boolean =
        lastNudgedAtMillis == null || nowMillis - lastNudgedAtMillis >= COOLDOWN_MS
}
