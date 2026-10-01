package com.obsidianmedia.learnwithalphonso.data

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
) {
    fun asPending() = PendingLessonCompletion(
        lessonId, total,
        ContentJson.json.decodeFromString(ListSerializer(LessonAnswer.serializer()), answersJson),
        course, queuedAt, optimisticXpEstimate,
    )

    companion object {
        fun from(p: PendingLessonCompletion) = PendingLessonCompletionRecord(
            lessonId = p.lessonId, total = p.total,
            answersJson = ContentJson.json.encodeToString(ListSerializer(LessonAnswer.serializer()), p.answers),
            course = p.course, queuedAt = p.queuedAt, optimisticXpEstimate = p.optimisticXpEstimate,
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
) {
    fun asPending() = PendingReviewGrade(itemKey, answer, course, queuedAt)

    companion object {
        fun from(p: PendingReviewGrade) = PendingReviewGradeRecord(itemKey = p.itemKey, answer = p.answer, course = p.course, queuedAt = p.queuedAt)
    }
}

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
) {
    fun progress(): LessonCompletionProgress? =
        progressJson?.let { runCatching { ContentJson.json.decodeFromString(LessonCompletionProgress.serializer(), it) }.getOrNull() }
}
