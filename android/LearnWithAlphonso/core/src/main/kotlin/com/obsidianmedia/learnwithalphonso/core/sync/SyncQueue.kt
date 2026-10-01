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
)

/** A review grade submitted offline. Order matters here; see SyncEngine. */
data class PendingReviewGrade(
    val itemKey: String,
    val answer: String,
    val course: String,
    val queuedAt: Long,
)

/** What one sync pass drained. Anything absent stays queued for the next pass. */
data class SyncResult(
    val syncedLessonCompletions: List<PendingLessonCompletion>,
    val syncedReviewGrades: List<PendingReviewGrade>,
    /** Progress from the most recently synced completion, to cache as last known. */
    val lastKnownProgress: LessonCompletionProgress?,
)
