package com.obsidianmedia.learnwithalphonso.data

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import com.obsidianmedia.learnwithalphonso.core.sync.PendingLessonCompletion
import com.obsidianmedia.learnwithalphonso.core.sync.PendingReviewGrade
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/** The one seam every screen uses for offline state. Port of SyncQueueStore.swift over Room. */
interface SyncQueueStore {
    suspend fun pendingLessonCompletions(): List<PendingLessonCompletion>
    suspend fun appendLessonCompletion(pending: PendingLessonCompletion)
    suspend fun removeSyncedLessonCompletions(synced: List<PendingLessonCompletion>)

    suspend fun pendingReviewGrades(): List<PendingReviewGrade>
    suspend fun appendReviewGrade(pending: PendingReviewGrade)
    suspend fun removeSyncedReviewGrades(synced: List<PendingReviewGrade>)

    suspend fun lastKnownDueReviews(): List<ReviewItem>
    /** Replaces the whole cache after an authoritative online fetch. */
    suspend fun replaceLastKnownDueReviews(items: List<ReviewItem>)
    /** Removes one item graded offline whose new dueOn is after today. A wrong answer keeps it due, so it stays. */
    suspend fun removeCachedDueReview(itemKey: String)
    val dueCount: Flow<Int>

    suspend fun lastKnownProgress(): LessonCompletionProgress?
    val progress: Flow<LessonCompletionProgress?>
    suspend fun updateLastKnownProgress(progress: LessonCompletionProgress)
    suspend fun lastSyncedAt(): Long?
    suspend fun markSyncedNow()
}

class RoomSyncQueueStore(private val dao: SyncDao, private val now: () -> Long = System::currentTimeMillis) : SyncQueueStore {
    override suspend fun pendingLessonCompletions() = dao.pendingLessonCompletions().map { it.asPending() }
    override suspend fun appendLessonCompletion(pending: PendingLessonCompletion) = dao.insertLessonCompletion(PendingLessonCompletionRecord.from(pending))
    override suspend fun removeSyncedLessonCompletions(synced: List<PendingLessonCompletion>) {
        synced.forEach { dao.deleteLessonCompletion(it.lessonId, it.queuedAt) }
    }

    override suspend fun pendingReviewGrades() = dao.pendingReviewGrades().map { it.asPending() }
    override suspend fun appendReviewGrade(pending: PendingReviewGrade) = dao.insertReviewGrade(PendingReviewGradeRecord.from(pending))
    override suspend fun removeSyncedReviewGrades(synced: List<PendingReviewGrade>) {
        synced.forEach { dao.deleteReviewGrade(it.itemKey, it.queuedAt) }
    }

    override suspend fun lastKnownDueReviews() = dao.cachedDueReviews().map { it.asReviewItem() }
    override suspend fun replaceLastKnownDueReviews(items: List<ReviewItem>) {
        dao.clearCachedDueReviews()
        dao.insertCachedDueReviews(items.distinctBy { it.itemKey }.map { CachedDueReviewRecord.from(it) })
    }
    override suspend fun removeCachedDueReview(itemKey: String) = dao.deleteCachedDueReview(itemKey)
    override val dueCount: Flow<Int> get() = dao.cachedDueReviewCount()

    override suspend fun lastKnownProgress() = dao.syncState()?.progress()
    override val progress: Flow<LessonCompletionProgress?> get() = dao.syncStateFlow().map { it?.progress() }
    override suspend fun updateLastKnownProgress(progress: LessonCompletionProgress) {
        val current = dao.syncState() ?: AppSyncStateRecord()
        dao.upsertSyncState(
            current.copy(lastSyncedAt = now(), progressJson = ContentJson.json.encodeToString(LessonCompletionProgress.serializer(), progress)),
        )
    }
    override suspend fun lastSyncedAt() = dao.syncState()?.lastSyncedAt
    override suspend fun markSyncedNow() {
        val current = dao.syncState() ?: AppSyncStateRecord()
        dao.upsertSyncState(current.copy(lastSyncedAt = now()))
    }
}
