package com.obsidianmedia.learnwithalphonso.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.net.LessonAnswer
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import com.obsidianmedia.learnwithalphonso.core.sync.PendingLessonCompletion
import com.obsidianmedia.learnwithalphonso.core.sync.PendingReviewGrade
import kotlinx.serialization.builtins.ListSerializer

/**
 * Room records mirroring SyncQueueStore.swift's SwiftData models. The core
 * data classes stay Android-free; these convert at the boundary. Nested
 * lists are stored as JSON text via ContentJson.
 */

@Entity(tableName = "pending_lesson_completions")
data class PendingLessonCompletionRecord(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val lessonId: String,
    val total: Int,
    val answersJson: String,
    val course: String,
    val queuedAt: Long,
    val optimisticXpEstimate: Int,
    val ownerUserId: String? = null,
    val sessionToken: String? = null,
    @ColumnInfo(defaultValue = "0") val attemptCount: Int = 0,
    val nextAttemptAt: Long? = null,
) {
    fun asPending() = PendingLessonCompletion(
        lessonId, total,
        ContentJson.json.decodeFromString(ListSerializer(LessonAnswer.serializer()), answersJson),
        course, queuedAt, optimisticXpEstimate, ownerUserId, sessionToken, attemptCount, nextAttemptAt,
    )

    companion object {
        fun from(p: PendingLessonCompletion) = PendingLessonCompletionRecord(
            lessonId = p.lessonId, total = p.total,
            answersJson = ContentJson.json.encodeToString(ListSerializer(LessonAnswer.serializer()), p.answers),
            course = p.course, queuedAt = p.queuedAt, optimisticXpEstimate = p.optimisticXpEstimate,
            ownerUserId = p.ownerUserId, sessionToken = p.sessionToken, attemptCount = p.attemptCount, nextAttemptAt = p.nextAttemptAt,
        )
    }
}

@Entity(tableName = "pending_review_grades")
data class PendingReviewGradeRecord(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val itemKey: String,
    val answer: String,
    val course: String,
    val queuedAt: Long,
    val ownerUserId: String? = null,
    @ColumnInfo(defaultValue = "0") val attemptCount: Int = 0,
    val nextAttemptAt: Long? = null,
) {
    fun asPending() = PendingReviewGrade(itemKey, answer, course, queuedAt, ownerUserId, attemptCount, nextAttemptAt)

    companion object {
        fun from(p: PendingReviewGrade) = PendingReviewGradeRecord(
            itemKey = p.itemKey, answer = p.answer, course = p.course, queuedAt = p.queuedAt,
            ownerUserId = p.ownerUserId, attemptCount = p.attemptCount, nextAttemptAt = p.nextAttemptAt,
        )
    }
}

/**
 * A queued item the server will never accept, moved out of the queue so it stops blocking it (the dead-letter table).
 * The Learn tab shows a notice with a support address; the record stays for support.
 */
@Entity(tableName = "dead_letters")
data class DeadLetterRecord(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    /** "lesson" or "grade". */
    val kind: String,
    /** The item's queue identity (lesson id or item key, course, queued time). */
    val identity: String,
    val reason: String,
    val deadAt: Long,
    /** Who queued it, so one account never sees (or mails support about) another's lost lesson. */
    val ownerUserId: String? = null,
)

@Entity(tableName = "cached_due_reviews")
data class CachedDueReviewRecord(
    @PrimaryKey val itemKey: String,
    val json: String,
) {
    fun asReviewItem(): ReviewItem = ContentJson.json.decodeFromString(ReviewItem.serializer(), json)

    companion object {
        fun from(item: ReviewItem) = CachedDueReviewRecord(item.itemKey, ContentJson.json.encodeToString(ReviewItem.serializer(), item))
    }
}

/** Singleton row: the last known progress and the last successful sync time. */
@Entity(tableName = "app_sync_state")
data class AppSyncStateRecord(
    @PrimaryKey val id: Int = 1,
    val lastSyncedAt: Long? = null,
    val progressJson: String? = null,
    /** True once rows queued by a build that did not record an owner have been adopted (or dropped); it happens once. */
    @ColumnInfo(defaultValue = "0") val orphansResolved: Boolean = false,
) {
    fun progress(): LessonCompletionProgress? =
        progressJson?.let { runCatching { ContentJson.json.decodeFromString(LessonCompletionProgress.serializer(), it) }.getOrNull() }
}
