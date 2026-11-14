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

    /**
     * One heart comes back every HEART_REFILL_MS while hearts are below MAX_HEARTS, counted from the moment the
     * learner first dropped below the cap (or from the last refill). heartsRefillAt is when the NEXT heart arrives and
     * is null exactly when hearts are full. Every heart that has come due is added (two hours away = four), capped at
     * MAX_HEARTS, with the leftover time carried into the next one. A row below the cap with no timer starts the clock
     * now rather than staying stuck. Same rule as src/lib/hearts.ts and the SQL hearts_refill_resolve.
     */
    fun resolveHeartsRefill(hearts: Int, heartsRefillAt: Long?, now: Long): HeartsState {
        if (hearts >= MAX_HEARTS) return HeartsState(MAX_HEARTS, null)
        if (heartsRefillAt == null) return HeartsState(hearts, now + HEART_REFILL_MS)
        if (now < heartsRefillAt) return HeartsState(hearts, heartsRefillAt)
        val due = 1 + ((now - heartsRefillAt) / HEART_REFILL_MS).toInt()
        val next = min(MAX_HEARTS, hearts + due)
        return if (next >= MAX_HEARTS) HeartsState(MAX_HEARTS, null)
        else HeartsState(next, heartsRefillAt + due * HEART_REFILL_MS)
    }

    /** Adds hearts up to the cap. A refill already running keeps its clock; the timer clears only at full hearts. */
    fun gainHearts(hearts: Int, amount: Int, heartsRefillAt: Long?, now: Long): HeartsState {
        val cur = resolveHeartsRefill(hearts, heartsRefillAt, now)
        return resolveHeartsRefill(min(MAX_HEARTS, cur.hearts + amount), cur.heartsRefillAt, now)
    }

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
    fun gate(hearts: Int, heartsRefillAt: Long?, now: Long, unlimited: Boolean = false): GateDecision {
        // Alphonso Pro has unlimited hearts; the server agrees (lose_heart and the lesson settlement skip Pro).
        if (unlimited) return GateDecision.Open
        val resolved = resolveHeartsRefill(hearts, heartsRefillAt, now)
        return if (resolved.hearts > 0) GateDecision.Open else GateDecision.OutOfHearts(resolved.heartsRefillAt)
    }

    /**
     * "M:SS" until the next heart comes back (ceil to the second, like the web's useCountdown), or null when hearts
     * are full, no clock is running, or the heart is already due. Drives the "+1 in 12:34" hint next to the counter.
     */
    fun nextHeartCountdown(hearts: Int, heartsRefillAt: Long?, now: Long): String? {
        if (hearts >= MAX_HEARTS || heartsRefillAt == null) return null
        val remainingMs = heartsRefillAt - now
        if (remainingMs <= 0) return null
        val total = ((remainingMs + 999) / 1000).toInt()
        return "${total / 60}:${(total % 60).toString().padStart(2, '0')}"
    }

    /** Whether a wrong answer costs a heart. False for Alphonso Pro (unlimited hearts). */
    fun wrongAnswerCostsHeart(unlimited: Boolean): Boolean = !unlimited

    /**
     * The cached state after a wrong answer costs a heart (lose_heart does the same). Due refills are settled first; a
     * refill already pending keeps its clock (losing a heart does not reset the wait); from full hearts a new
     * 30-minute clock starts now, so the offline gate and the header can show a countdown.
     */
    fun afterLosingHeart(hearts: Int, heartsRefillAt: Long?, now: Long): HeartsState {
        val cur = resolveHeartsRefill(hearts, heartsRefillAt, now)
        return HeartsState(maxOf(0, cur.hearts - 1), cur.heartsRefillAt ?: (now + HEART_REFILL_MS))
    }
}

/**
 * Everything the out-of-hearts screen shows, so the composable only renders. Same copy and M:SS countdown
 * (ceil to the second) as the iOS Kit's OutOfHeartsModel and the web's HeartsModal.
 */
data class OutOfHeartsModel(val refillAt: Long?, /** The hearts the learner has when the sheet opens (0 at the gate; the sheet shows what it is given). */ val hearts: Int = 0) {
    fun countdown(now: Long): String? {
        val refill = refillAt ?: return null
        val remainingMs = refill - now
        if (remainingMs <= 0) return null
        val total = ((remainingMs + 999) / 1000).toInt()
        return "${total / 60}:${(total % 60).toString().padStart(2, '0')}"
    }

    fun isRefillDue(now: Long): Boolean = refillAt != null && now >= refillAt

    fun message(now: Long): String = countdown(now)?.let { "You've used all your hearts for now. Your next heart comes back in $it." }
        ?: "You've used all your hearts for now. A heart will come back shortly."

    /** Buying needs the server. Review and practice never cost hearts, so that path is always offered. */
    fun showsBuy(isOnline: Boolean): Boolean = isOnline

    companion object {
        const val TITLE = "Out of hearts"
        const val BUY_TITLE = "Use ${HeartsEconomy.XP_HEART_COST} XP for a heart"
        const val REVIEW_INSTEAD_TITLE = "Review instead"
    }
}
