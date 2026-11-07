package com.obsidianmedia.learnwithalphonso.core.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Wire models shared by ProgressSyncClient, the sync queue and the UI. Field names match the JSON. */

@Serializable
data class LessonAnswer(val questionId: String, val answer: String)

@Serializable
data class LessonCompletionProgress(
    val xp: Int,
    val streak: Int,
    val longestStreak: Int,
    val lastActiveDate: String? = null,
    val hearts: Int,
    /** Epoch milliseconds, as complete-lesson reports it; null when no refill is pending. */
    val heartsRefillAt: Double? = null,
    val streakFreezes: Int,
    val leagueTier: String,
)

@Serializable
data class LessonCompletionResult(
    val xpGain: Int,
    /**
     * Right answers by the server's own grading: the count [xpGain] was computed from, so the complete screen's XP
     * lines use it. Null from a server older than this field.
     */
    val correct: Int? = null,
    val newlyUnlocked: List<String> = emptyList(),
    val heartsBonus: String? = null,
    val progress: LessonCompletionProgress,
)

@Serializable
data class ReviewItem(
    @SerialName("item_key") val itemKey: String,
    @SerialName("lesson_id") val lessonId: String,
    val level: String,
    val ease: Double,
    @SerialName("interval_days") val intervalDays: Int,
    val repetitions: Int,
    @SerialName("due_on") val dueOn: String,
    @SerialName("last_reviewed_at") val lastReviewedAt: String? = null,
    /**
     * True only when dueOn/lastReviewedAt came straight from the server row. A cached item written before
     * lastReviewedAt existed decodes with lastReviewedAt == null, which would read as "never reviewed" and get the
     * grade dropped as superseded; with this false the grade is sent without a freshness snapshot instead.
     */
    @SerialName("has_review_snapshot") val hasReviewSnapshot: Boolean = false,
    val source: String = "lesson",
    @SerialName("weakness_display") val weaknessDisplay: String? = null,
    val prompt: String? = null,
    val choices: List<String>? = null,
    @SerialName("answer_index") val answerIndex: Int? = null,
    val explanation: String? = null,
) {
    /**
     * Carries its own question instead of pointing at a bundled lesson question: Hector weakness items and saved words.
     * The review screen builds the card from the row itself.
     */
    val isSelfContained: Boolean get() = source == "weakness" || source == "saved_word"

    /** The freshness snapshot to grade against, or null (send none) when it is unknown. */
    fun snapshotDueOn(): String? = if (hasReviewSnapshot) dueOn else null
    fun snapshotLastReviewedAt(): String? = if (hasReviewSnapshot) lastReviewedAt else null
}

@Serializable
data class DueReviews(val due: List<ReviewItem>, val total: Int)

@Serializable
data class ReviewGradeOutcome(val retired: Boolean, val dueOn: String, val correct: Boolean? = null, val superseded: Boolean = false) {
    /** Whether the item is still due today or earlier, which is what a wrong answer gets (ISO dates compare as strings). */
    fun isStillDue(today: String): Boolean = !retired && dueOn <= today
}

@Serializable
data class ReviewClearBonus(val granted: Boolean, val hearts: Int? = null)

@Serializable
data class HeartsResult(val hearts: Int)

@Serializable
data class HeartsRefillResult(val hearts: Int, val heartsRefillAt: Double? = null)

/** The outcome of `buy_heart_with_xp(_course)`, same cases as the iOS Kit's BuyHeartResult. */
sealed interface BuyHeartResult {
    data class Ok(val hearts: Int, val xp: Int) : BuyHeartResult
    data class HeartsFull(val hearts: Int?) : BuyHeartResult
    data class InsufficientXp(val xp: Int?) : BuyHeartResult
    /** The RPC saw no signed-in user. */
    data object SignedOut : BuyHeartResult

    companion object {
        /** Null on success; otherwise the line the out-of-hearts screen shows under the buy button. */
        fun failureMessage(result: BuyHeartResult): String? = when (result) {
            is Ok -> null
            is HeartsFull -> "Hearts already full."
            SignedOut -> "You've been signed out. Please sign in again."
            is InsufficientXp -> result.xp?.let { "Not enough XP for a heart. You have $it XP in this course." }
                ?: "Not enough XP for a heart."
        }
    }
}

@Serializable
data class UnlockedAchievement(
    @SerialName("achievement_id") val achievementId: String,
    val progress: Int = 0,
)
