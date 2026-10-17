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

    sealed interface GateDecision {
        data object Open : GateDecision
        data class OutOfHearts(val refillAt: Long?) : GateDecision
    }

    /**
     * The same rule as src/lib/hearts.ts's heartsGate and the start-lesson-session edge function. Used only
     * OFFLINE, against the cached progress; online the server's 409 is the rule.
     */
    fun gate(hearts: Int, heartsRefillAt: Long?, now: Long): GateDecision {
        val resolved = resolveHeartsRefill(hearts, heartsRefillAt, now)
        return if (resolved.hearts > 0) GateDecision.Open else GateDecision.OutOfHearts(resolved.heartsRefillAt)
    }

    /**
     * The cached state after a wrong answer costs a heart. When the last one goes and no refill is pending, the
     * refill is due one interval from now, so the offline gate can show a countdown (lose_heart sets the same timer).
     */
    fun afterLosingHeart(hearts: Int, heartsRefillAt: Long?, now: Long): HeartsState {
        val remaining = maxOf(0, hearts - 1)
        if (remaining == 0 && heartsRefillAt == null) return HeartsState(0, now + HEART_REFILL_MS)
        return HeartsState(remaining, heartsRefillAt)
    }
}

/**
 * Everything the out-of-hearts screen shows, so the composable only renders. Same copy and M:SS countdown
 * (ceil to the second) as the iOS Kit's OutOfHeartsModel and the web's HeartsModal.
 */
data class OutOfHeartsModel(val refillAt: Long?) {
    fun countdown(now: Long): String? {
        val refill = refillAt ?: return null
        val remainingMs = refill - now
        if (remainingMs <= 0) return null
        val total = ((remainingMs + 999) / 1000).toInt()
        return "${total / 60}:${(total % 60).toString().padStart(2, '0')}"
    }

    fun isRefillDue(now: Long): Boolean = refillAt != null && now >= refillAt

    fun message(now: Long): String = countdown(now)?.let { "You've used all your hearts for now. They refill automatically in $it." }
        ?: "You've used all your hearts for now. They'll refill again shortly."

    /** Buying needs the server. Review and practice never cost hearts, so that path is always offered. */
    fun showsBuy(isOnline: Boolean): Boolean = isOnline

    companion object {
        const val TITLE = "Out of hearts"
        const val BUY_TITLE = "Use ${HeartsEconomy.XP_HEART_COST} XP for a heart"
        const val REVIEW_INSTEAD_TITLE = "Review instead"
    }
}
