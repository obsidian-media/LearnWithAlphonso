package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Achievement

/**
 * The state mapping behind the redesigned Achievements screen (batch 2, screen 14 and 14b): which look a badge has, the
 * progress words, the tier label and the ladder of a family. The views only lay these out. Word for word the same as
 * the web and iOS screens: change all three together.
 */
object AchievementPresentation {
    enum class State { UNLOCKED, IN_REACH, LOCKED, UNKNOWN }

    /**
     * A badge's look: unlocked, locked with some progress (the ring and "12 of 30"), or locked with none. When the unlock
     * read failed ([known] false) nothing is claimed either way: no lock, no ring.
     */
    fun state(unlocked: Boolean, value: Int, known: Boolean = true): State = when {
        !known -> State.UNKNOWN
        unlocked -> State.UNLOCKED
        value > 0 -> State.IN_REACH
        else -> State.LOCKED
    }

    /** "7 of 25 unlocked". */
    fun summary(unlocked: Int, total: Int): String = "$unlocked of $total unlocked"

    /** "Gold". An unknown tier (a newer catalog) is shown capitalised as it is, never hidden. */
    fun tierLabel(tier: String): String = tier.replaceFirstChar { it.uppercase() }

    /** How far a locked badge is, 0 to 1; a badge with no threshold has none. The server stops counting at the threshold, so it never passes 1. */
    fun fraction(value: Int, threshold: Int): Float =
        if (threshold <= 0) 0f else (value.coerceAtLeast(0).toFloat() / threshold.toFloat()).coerceIn(0f, 1f)

    /** "12 of 30"; the value is held at the threshold so a finished family never reads "31 of 30". */
    fun progressLine(value: Int, threshold: Int): String = "${value.coerceIn(0, maxOf(threshold, 0))} of $threshold"

    /** "40%", rounded down so "99%" never reads as done. */
    fun percentLabel(value: Int, threshold: Int): String = "${(fraction(value, threshold) * 100).toInt()}%"

    /** The family a badge belongs to, in order of threshold: the ladder shown on its detail view. */
    fun ladder(catalog: List<Achievement>, category: String): List<Achievement> =
        catalog.filter { it.category == category }.sortedBy { it.threshold }

    /** The drawable name of a badge's medallion: `badge_streak_7` for the achievement `streak_7`. */
    fun medallionName(id: String): String = "badge_$id"

    /** The ladder's title ("Streak ladder"); a family with a single badge (the team badge) has no ladder. */
    fun ladderTitle(category: String, ladderSize: Int): String? =
        if (ladderSize < 2) null else "${category.replaceFirstChar { it.uppercase() }} ladder"
}
