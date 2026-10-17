package com.obsidianmedia.learnwithalphonso.core.sync

import com.obsidianmedia.learnwithalphonso.core.net.LessonAnswer
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress

/**
 * A lesson completion attempted while offline. `optimisticXpEstimate` is
 * computeXpGain for this attempt alone; it ignores the server's replay rule
 * (XP is the delta over the stored best) because the client has no history,
 * so it is display-only and corrected when the real result arrives.
 */
data class PendingLessonCompletion(
    val lessonId: String,
    val total: Int,
    val answers: List<LessonAnswer>,
    val course: String,
    val queuedAt: Long,
    val optimisticXpEstimate: Int,
    /** The account that played this lesson. Null only for rows written before the owner was recorded; the first account to sync adopts those. */
    val ownerUserId: String? = null,
    /** The start-lesson-session token from when the lesson opened, if it was online then. */
    val sessionToken: String? = null,
    /** Failures so far; it only drives the backoff. */
    val attemptCount: Int = 0,
    /** Epoch millis before which sync leaves the row alone; null means due now. */
    val nextAttemptAt: Long? = null,
) {
    /** Stable across retries (attempt fields change; this does not). The store matches rows by it. */
    val queueIdentity: String get() = "$lessonId|$course|$queuedAt"

    fun rescheduled(attemptCount: Int, nextAttemptAt: Long): PendingLessonCompletion = copy(attemptCount = attemptCount, nextAttemptAt = nextAttemptAt)
}

/** A review grade submitted offline. Order matters here; see SyncEngine. */
data class PendingReviewGrade(
    val itemKey: String,
    val answer: String,
    val course: String,
    val queuedAt: Long,
    val ownerUserId: String? = null,
    val attemptCount: Int = 0,
    val nextAttemptAt: Long? = null,
) {
    /**
     * Stable across retries. It is also the attempt id the server stores with the graded result (`attemptId`), so a
     * grade whose response was lost is replayed instead of being graded a second time.
     */
    val queueIdentity: String get() = "$itemKey|$course|$queuedAt"

    fun rescheduled(attemptCount: Int, nextAttemptAt: Long): PendingReviewGrade = copy(attemptCount = attemptCount, nextAttemptAt = nextAttemptAt)
}

/** An item that will never succeed, with a stable reason for the dead-letter store. */
data class DeadLetter<T>(val item: T, val reason: String)

/**
 * What one sync pass did. Items present in no list are untouched (still queued, waiting out a backoff, or unauthorized
 * this pass) and stay as they are.
 */
data class SyncResult(
    val syncedLessonCompletions: List<PendingLessonCompletion>,
    val syncedReviewGrades: List<PendingReviewGrade>,
    /** Progress from the most recently synced completion, to cache as last known. */
    val lastKnownProgress: LessonCompletionProgress?,
    /** Failed for a transient reason: keep the row, with its new attempt count and next attempt time. */
    val rescheduledLessonCompletions: List<PendingLessonCompletion> = emptyList(),
    /** Can never succeed (rejected by the server): move out of the queue. */
    val deadLetteredLessonCompletions: List<DeadLetter<PendingLessonCompletion>> = emptyList(),
    /** Belong to another account: delete, never send. */
    val droppedForeignLessonCompletions: List<PendingLessonCompletion> = emptyList(),
    val rescheduledReviewGrades: List<PendingReviewGrade> = emptyList(),
    val deadLetteredReviewGrades: List<DeadLetter<PendingReviewGrade>> = emptyList(),
    val droppedForeignReviewGrades: List<PendingReviewGrade> = emptyList(),
)
