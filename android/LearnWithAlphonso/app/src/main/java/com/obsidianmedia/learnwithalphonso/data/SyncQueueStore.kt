package com.obsidianmedia.learnwithalphonso.data

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import com.obsidianmedia.learnwithalphonso.core.sync.PendingLessonCompletion
import com.obsidianmedia.learnwithalphonso.core.sync.DeadLetterInfo
import com.obsidianmedia.learnwithalphonso.core.sync.PendingReviewGrade
import com.obsidianmedia.learnwithalphonso.core.sync.SyncResult
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map

/** The one seam every screen uses for offline state. Port of SyncQueueStore.swift over Room. */
interface SyncQueueStore {
    suspend fun pendingLessonCompletions(): List<PendingLessonCompletion>
    suspend fun appendLessonCompletion(pending: PendingLessonCompletion)
    suspend fun removeSyncedLessonCompletions(synced: List<PendingLessonCompletion>)

    suspend fun pendingReviewGrades(): List<PendingReviewGrade>
    suspend fun appendReviewGrade(pending: PendingReviewGrade)
    suspend fun removeSyncedReviewGrades(synced: List<PendingReviewGrade>)

    /**
     * Rows queued by a build that did not record an owner. Called once per launch, right after the session is
     * restored, with the restored account (null when nobody was). The first call after the upgrade gives them to that
     * account; with nobody restored, or on any later call, they are dropped, so they can never move to a different
     * account that signs in later.
     */
    suspend fun resolveOrphanedRows(restoredUserId: String?)

    /**
     * The account [userId] ended (signed out, or switched away from). Removes what is its own: its queued work and lost
     * lessons, and rows with no owner; and clears the single-account caches (due reviews, last-known progress). Rows another
     * account queued are left alone: that account's own sync decides them.
     */
    suspend fun clearAccount(userId: String)

    /**
     * Everything here belongs to the account that was signed in: queued work, dead letters, the due-review cache and
     * the last-known progress. The next account on this device starts with none of it.
     */
    suspend fun clearAll()

    /**
     * Applies a whole sync pass: removes what synced, keeps what was rescheduled with its new attempt count and time,
     * moves what the server permanently rejected to the dead-letter table (with its reason), and deletes what another
     * account queued.
     */
    suspend fun applySyncResult(result: SyncResult, nowMillis: Long)

    /** What is waiting for this account (0 with no account). */
    fun pendingLessonCount(userId: String?): Flow<Int>
    fun pendingReviewGradeCount(userId: String?): Flow<Int>

    /** Emits whenever something is queued or leaves the queue, so the sync wake-up can be re-armed. */
    val queueChanges: Flow<Pair<Int, Int>>

    /** Lesson completions the server will never accept for this account, newest first. The Learn tab shows a notice with a support address. */
    fun lessonDeadLetters(userId: String?): Flow<List<DeadLetterInfo>>

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
    /** Runs the block as one database transaction (AppContainer passes the database's). */
    private val inTransaction: suspend (suspend () -> Unit) -> Unit = { it() },
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

    override suspend fun resolveOrphanedRows(restoredUserId: String?) = inTransaction {
        val state = dao.syncState() ?: AppSyncStateRecord()
        if (!state.orphansResolved && restoredUserId != null) {
            dao.adoptLessonCompletions(restoredUserId)
            dao.adoptReviewGrades(restoredUserId)
        } else {
            dao.deleteOwnerlessLessonCompletions()
            dao.deleteOwnerlessReviewGrades()
        }
        if (!state.orphansResolved) dao.upsertSyncState(state.copy(orphansResolved = true))
    }

    override suspend fun clearAccount(userId: String) = inTransaction {
        dao.clearLessonCompletionsOf(userId)
        dao.clearReviewGradesOf(userId)
        dao.clearDeadLettersOf(userId)
        dao.clearCachedDueReviews()
        dao.clearSyncState()
        dao.upsertSyncState(AppSyncStateRecord(orphansResolved = true))
    }

    override suspend fun clearAll() = inTransaction {
        dao.clearLessonCompletions()
        dao.clearReviewGrades()
        dao.clearCachedDueReviews()
        dao.clearDeadLetters()
        dao.clearSyncState()
        // Nothing queued survives, so there is nothing left to adopt: the next account must never inherit an ownerless row.
        dao.upsertSyncState(AppSyncStateRecord(orphansResolved = true))
    }

    override suspend fun applySyncResult(result: SyncResult, nowMillis: Long) = inTransaction {
        removeSyncedLessonCompletions(result.syncedLessonCompletions)
        removeSyncedReviewGrades(result.syncedReviewGrades)
        result.rescheduledLessonCompletions.forEach { dao.rescheduleLessonCompletion(it.lessonId, it.course, it.queuedAt, it.attemptCount, it.nextAttemptAt ?: nowMillis) }
        result.rescheduledReviewGrades.forEach { dao.rescheduleReviewGrade(it.itemKey, it.course, it.queuedAt, it.attemptCount, it.nextAttemptAt ?: nowMillis) }
        result.deadLetteredLessonCompletions.forEach {
            dao.insertDeadLetter(DeadLetterRecord(kind = "lesson", identity = it.item.queueIdentity, reason = it.reason, deadAt = nowMillis, ownerUserId = it.item.ownerUserId))
            dao.deleteLessonCompletion(it.item.lessonId, it.item.queuedAt)
        }
        result.deadLetteredReviewGrades.forEach {
            dao.insertDeadLetter(DeadLetterRecord(kind = "grade", identity = it.item.queueIdentity, reason = it.reason, deadAt = nowMillis, ownerUserId = it.item.ownerUserId))
            dao.deleteReviewGrade(it.item.itemKey, it.item.queuedAt)
        }
        removeSyncedLessonCompletions(result.droppedForeignLessonCompletions)
        removeSyncedReviewGrades(result.droppedForeignReviewGrades)
        dao.trimDeadLetters()
    }

    override fun pendingLessonCount(userId: String?): Flow<Int> = if (userId == null) flowOf(0) else dao.pendingLessonCompletionCountFor(userId)
    override fun pendingReviewGradeCount(userId: String?): Flow<Int> = if (userId == null) flowOf(0) else dao.pendingReviewGradeCountFor(userId)
    override val queueChanges: Flow<Pair<Int, Int>> get() = combine(dao.pendingLessonCompletionCount(), dao.pendingReviewGradeCount()) { l, g -> l to g }
    override fun lessonDeadLetters(userId: String?): Flow<List<DeadLetterInfo>> =
        if (userId == null) flowOf(emptyList()) else dao.lessonDeadLetters(userId).map { rows -> rows.map { DeadLetterInfo(it.identity, it.reason) } }

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
        // Read, copy, write in one transaction: a concurrent write to another column (orphansResolved) must not be undone.
        inTransaction {
            val current = dao.syncState() ?: AppSyncStateRecord()
            dao.upsertSyncState(
                current.copy(lastSyncedAt = now(), progressJson = ContentJson.json.encodeToString(LessonCompletionProgress.serializer(), progress)),
            )
        }
        runCatching { onProgressUpdated(progress) }
    }
    override suspend fun lastSyncedAt() = dao.syncState()?.lastSyncedAt
    override suspend fun markSyncedNow() = inTransaction {
        val current = dao.syncState() ?: AppSyncStateRecord()
        dao.upsertSyncState(current.copy(lastSyncedAt = now()))
    }
}
