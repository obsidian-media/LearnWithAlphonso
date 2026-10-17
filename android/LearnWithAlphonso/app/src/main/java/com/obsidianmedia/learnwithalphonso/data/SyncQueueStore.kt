package com.obsidianmedia.learnwithalphonso.data

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import com.obsidianmedia.learnwithalphonso.core.sync.PendingLessonCompletion
import com.obsidianmedia.learnwithalphonso.core.sync.DeadLetterInfo
import com.obsidianmedia.learnwithalphonso.core.sync.PendingReviewGrade
import com.obsidianmedia.learnwithalphonso.core.sync.SyncResult
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

    /** Rows queued by a build that did not record an owner belong to the first account that syncs. */
    suspend fun adoptOrphanedRows(userId: String)

    /**
     * Applies a whole sync pass: removes what synced, keeps what was rescheduled with its new attempt count and time,
     * moves what the server permanently rejected to the dead-letter table (with its reason), and deletes what another
     * account queued.
     */
    suspend fun applySyncResult(result: SyncResult, nowMillis: Long)

    val pendingLessonCount: Flow<Int>
    val pendingReviewGradeCount: Flow<Int>

    /** Items the server will never accept, newest last. The Learn tab shows a notice with a support address. */
    val deadLetters: Flow<List<DeadLetterInfo>>

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

class RoomSyncQueueStore(
    private val dao: SyncDao,
    /** Plan 4: the widget publisher; every progress update funnels through here, as WidgetProgressPublisher does on iOS. */
    private val onProgressUpdated: suspend (LessonCompletionProgress) -> Unit = {},
    /** Last on purpose: a trailing lambda at call sites is the clock (SyncQueueStoreTest passes one). */
    private val now: () -> Long = System::currentTimeMillis,
) : SyncQueueStore {
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

    override suspend fun adoptOrphanedRows(userId: String) {
        dao.adoptLessonCompletions(userId)
        dao.adoptReviewGrades(userId)
    }

    override suspend fun applySyncResult(result: SyncResult, nowMillis: Long) {
        removeSyncedLessonCompletions(result.syncedLessonCompletions)
        removeSyncedReviewGrades(result.syncedReviewGrades)
        result.rescheduledLessonCompletions.forEach { dao.rescheduleLessonCompletion(it.lessonId, it.course, it.queuedAt, it.attemptCount, it.nextAttemptAt ?: nowMillis) }
        result.rescheduledReviewGrades.forEach { dao.rescheduleReviewGrade(it.itemKey, it.course, it.queuedAt, it.attemptCount, it.nextAttemptAt ?: nowMillis) }
        result.deadLetteredLessonCompletions.forEach {
            dao.insertDeadLetter(DeadLetterRecord(kind = "lesson", identity = it.item.queueIdentity, reason = it.reason, deadAt = nowMillis))
            dao.deleteLessonCompletion(it.item.lessonId, it.item.queuedAt)
        }
        result.deadLetteredReviewGrades.forEach {
            dao.insertDeadLetter(DeadLetterRecord(kind = "grade", identity = it.item.queueIdentity, reason = it.reason, deadAt = nowMillis))
            dao.deleteReviewGrade(it.item.itemKey, it.item.queuedAt)
        }
        removeSyncedLessonCompletions(result.droppedForeignLessonCompletions)
        removeSyncedReviewGrades(result.droppedForeignReviewGrades)
    }

    override val pendingLessonCount: Flow<Int> get() = dao.pendingLessonCompletionCount()
    override val pendingReviewGradeCount: Flow<Int> get() = dao.pendingReviewGradeCount()
    override val deadLetters: Flow<List<DeadLetterInfo>> get() = dao.deadLetters().map { rows -> rows.map { DeadLetterInfo(it.identity, it.reason) } }

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
        runCatching { onProgressUpdated(progress) }
    }
    override suspend fun lastSyncedAt() = dao.syncState()?.lastSyncedAt
    override suspend fun markSyncedNow() {
        val current = dao.syncState() ?: AppSyncStateRecord()
        dao.upsertSyncState(current.copy(lastSyncedAt = now()))
    }
}
