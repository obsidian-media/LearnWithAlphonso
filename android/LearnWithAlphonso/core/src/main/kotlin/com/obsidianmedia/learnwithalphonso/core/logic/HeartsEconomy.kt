package com.obsidianmedia.learnwithalphonso.core.logic

import kotlin.math.min

/**
 * Port of src/lib/hearts.ts. Timestamps are epoch milliseconds, which is how
 * the complete-lesson Edge Function reports heartsRefillAt.
 */
object HeartsEconomy {
    const val MAX_HEARTS = 5
    const val HEART_REFILL_MS = 30L * 60L * 1000L
    const val STREAK_HEART_MILESTONE_DAYS = 7
    const val XP_HEART_COST = 50

    data class HeartsState(val hearts: Int, val heartsRefillAt: Long?)

    /** Restores to max once the refill timestamp has passed (inclusive). */
    fun resolveHeartsRefill(hearts: Int, heartsRefillAt: Long?, now: Long): HeartsState {
        if (heartsRefillAt != null && now >= heartsRefillAt) return HeartsState(MAX_HEARTS, null)
        return HeartsState(hearts, heartsRefillAt)
    }

    /** Adds hearts up to the cap and clears any pending refill timer. */
    fun gainHearts(hearts: Int, amount: Int): HeartsState =
        HeartsState(min(MAX_HEARTS, hearts + amount), null)

    fun perfectLessonBonusEarned(correct: Int, total: Int): Boolean = total > 0 && correct == total

    fun streakHeartMilestoneReached(oldStreak: Int, newStreak: Int): Boolean =
        newStreak > oldStreak && newStreak % STREAK_HEART_MILESTONE_DAYS == 0

    sealed interface XpPurchaseResult {
        data class Ok(val hearts: Int, val xp: Int) : XpPurchaseResult
        data object HeartsFull : XpPurchaseResult
        data object InsufficientXp : XpPurchaseResult
    }

    fun buyHeartWithXp(hearts: Int, xp: Int, cost: Int = XP_HEART_COST): XpPurchaseResult {
        if (hearts >= MAX_HEARTS) return XpPurchaseResult.HeartsFull
        if (xp < cost) return XpPurchaseResult.InsufficientXp
        return XpPurchaseResult.Ok(hearts + 1, xp - cost)
    }
}
