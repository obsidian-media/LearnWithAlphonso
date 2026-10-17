package com.obsidianmedia.learnwithalphonso.data

import androidx.room.Room
import androidx.room.withTransaction
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.obsidianmedia.learnwithalphonso.core.net.LessonAnswer
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import com.obsidianmedia.learnwithalphonso.core.sync.PendingLessonCompletion
import com.obsidianmedia.learnwithalphonso.core.sync.DeadLetter
import com.obsidianmedia.learnwithalphonso.core.sync.PendingReviewGrade
import com.obsidianmedia.learnwithalphonso.core.sync.SyncResult
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SyncQueueStoreTest {
    private lateinit var db: AlphonsoDatabase
    private lateinit var store: RoomSyncQueueStore

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), AlphonsoDatabase::class.java).build()
        store = RoomSyncQueueStore(db.syncDao(), inTransaction = { block -> db.withTransaction { block() } }) { 1_000L }
    }

    @After
    fun tearDown() = db.close()

    @Test
    fun lessonCompletionsRoundTripInQueueOrderAndRemoveIndividually() = runBlocking {
        val older = PendingLessonCompletion("u1l1", 2, listOf(LessonAnswer("q1", "a"), LessonAnswer("q2", "b")), "en", 10, 40)
        val newer = PendingLessonCompletion("u1l2", 1, emptyList(), "fr", 20, 30)
        store.appendLessonCompletion(newer)
        store.appendLessonCompletion(older)
        assertEquals(listOf(older, newer), store.pendingLessonCompletions())
        store.removeSyncedLessonCompletions(listOf(older))
        assertEquals(listOf(newer), store.pendingLessonCompletions())
    }

    @Test
    fun reviewGradesRoundTrip() = runBlocking {
        val g = PendingReviewGrade("en:u1l1:q1", "cat", "en", 5)
        store.appendReviewGrade(g)
        assertEquals(listOf(g), store.pendingReviewGrades())
        store.removeSyncedReviewGrades(listOf(g))
        assertEquals(emptyList<PendingReviewGrade>(), store.pendingReviewGrades())
    }

    @Test
    fun dueReviewsReplaceCountAndRemove() = runBlocking {
        val a = ReviewItem("k1", "u1l1", "A1", 2.5, 1, 0, "2026-09-14")
        val b = ReviewItem("k2", "u1l1", "A1", 2.5, 1, 0, "2026-09-14", source = "weakness", prompt = "p", choices = listOf("x", "y"), answerIndex = 1, explanation = "e")
        store.replaceLastKnownDueReviews(listOf(a, b))
        assertEquals(2, store.dueCount.first())
        assertEquals(listOf("x", "y"), store.lastKnownDueReviews().first { it.itemKey == "k2" }.choices)
        store.removeCachedDueReview("k1")
        assertEquals(1, store.dueCount.first())
        store.replaceLastKnownDueReviews(emptyList())
        assertEquals(0, store.dueCount.first())
    }

    @Test
    fun progressRoundTripsNullRefillAndSyncTime() = runBlocking {
        assertNull(store.lastKnownProgress())
        assertNull(store.lastSyncedAt())
        val p = LessonCompletionProgress(120, 3, 5, "2026-09-14", 4, null, 1, "silver")
        store.updateLastKnownProgress(p)
        assertEquals(p, store.lastKnownProgress())
        assertEquals(p, store.progress.first())
        assertEquals(1_000L, store.lastSyncedAt())
    }

    private fun lesson(id: String, owner: String?, queuedAt: Long = 10) = PendingLessonCompletion(id, 1, emptyList(), "en", queuedAt, 30, ownerUserId = owner)

    @Test
    fun ownerlessRowsAreAdoptedOnceThenDropped() = runBlocking {
        store.appendLessonCompletion(lesson("old", null))
        store.appendReviewGrade(PendingReviewGrade("k", "a", "en", 5))
        store.resolveOrphanedRows("u1")
        assertEquals(listOf("u1"), store.pendingLessonCompletions().map { it.ownerUserId })
        assertEquals(listOf("u1"), store.pendingReviewGrades().map { it.ownerUserId })
        // A later ownerless row belongs to nobody: it is dropped, never given to whoever signs in next.
        store.appendLessonCompletion(lesson("late", null, queuedAt = 20))
        store.resolveOrphanedRows("u2")
        assertEquals(listOf("old"), store.pendingLessonCompletions().map { it.lessonId })
    }

    @Test
    fun countsAndLostLessonsAreScopedToTheAccount() = runBlocking {
        store.appendLessonCompletion(lesson("mine", "u1"))
        store.appendLessonCompletion(lesson("theirs", "u2", queuedAt = 20))
        store.appendReviewGrade(PendingReviewGrade("k", "a", "en", 5, ownerUserId = "u2"))
        assertEquals(1, store.pendingLessonCount("u1").first())
        assertEquals(0, store.pendingReviewGradeCount("u1").first())
        assertEquals(0, store.pendingLessonCount(null).first())

        val deadLesson = lesson("lost", "u1", queuedAt = 30)
        val deadGrade = PendingReviewGrade("g", "a", "en", 6, ownerUserId = "u1")
        val theirs = lesson("theirs-lost", "u2", queuedAt = 40)
        store.appendLessonCompletion(deadLesson); store.appendLessonCompletion(theirs); store.appendReviewGrade(deadGrade)
        store.applySyncResult(
            SyncResult(
                syncedLessonCompletions = emptyList(), syncedReviewGrades = emptyList(), lastKnownProgress = null,
                deadLetteredLessonCompletions = listOf(DeadLetter(deadLesson, "rejected"), DeadLetter(theirs, "rejected")),
                deadLetteredReviewGrades = listOf(DeadLetter(deadGrade, "rejected")),
            ),
            nowMillis = 500,
        )
        assertEquals(listOf(deadLesson.queueIdentity), store.lessonDeadLetters("u1").first().map { it.identity })
        assertEquals(emptyList<Any>(), store.lessonDeadLetters(null).first())
    }

    @Test
    fun deadLettersKeepTheNewestFifty() = runBlocking {
        val dead = (1..60).map { lesson("l$it", "u1", queuedAt = it.toLong()) }
        dead.forEach { store.appendLessonCompletion(it) }
        store.applySyncResult(SyncResult(emptyList(), emptyList(), null, deadLetteredLessonCompletions = dead.map { DeadLetter(it, "rejected") }), nowMillis = 500)
        assertEquals(50, store.lessonDeadLetters("u1").first().size)
    }

    @Test
    fun clearAllEmptiesEverythingTheNextAccountMustNotInherit() = runBlocking {
        store.appendLessonCompletion(lesson("a", "u1"))
        store.appendReviewGrade(PendingReviewGrade("k", "a", "en", 5, ownerUserId = "u1"))
        store.replaceLastKnownDueReviews(listOf(ReviewItem("k1", "u1l1", "A1", 2.5, 1, 0, "2026-09-14")))
        store.updateLastKnownProgress(LessonCompletionProgress(120, 3, 5, "2026-09-14", 4, null, 1, "silver"))
        store.clearAll()
        assertEquals(emptyList<PendingLessonCompletion>(), store.pendingLessonCompletions())
        assertEquals(emptyList<PendingReviewGrade>(), store.pendingReviewGrades())
        assertEquals(0, store.dueCount.first())
        assertNull(store.lastKnownProgress())
        // Nothing is left to adopt, so a row appended without an owner is dropped by the next account, not inherited.
        store.appendLessonCompletion(lesson("stray", null))
        store.resolveOrphanedRows("u2")
        assertEquals(emptyList<PendingLessonCompletion>(), store.pendingLessonCompletions())
    }
}
