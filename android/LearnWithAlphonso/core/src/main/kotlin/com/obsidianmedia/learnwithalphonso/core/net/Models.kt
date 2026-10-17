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
    val source: String = "lesson",
    @SerialName("weakness_display") val weaknessDisplay: String? = null,
    val prompt: String? = null,
    val choices: List<String>? = null,
    @SerialName("answer_index") val answerIndex: Int? = null,
    val explanation: String? = null,
)

@Serializable
data class DueReviews(val due: List<ReviewItem>, val total: Int)

@Serializable
data class ReviewGradeOutcome(val retired: Boolean, val dueOn: String, val correct: Boolean? = null)

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
