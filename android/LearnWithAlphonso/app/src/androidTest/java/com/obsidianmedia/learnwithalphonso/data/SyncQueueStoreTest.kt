package com.obsidianmedia.learnwithalphonso.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.obsidianmedia.learnwithalphonso.core.net.LessonAnswer
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import com.obsidianmedia.learnwithalphonso.core.sync.PendingLessonCompletion
import com.obsidianmedia.learnwithalphonso.core.sync.PendingReviewGrade
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
        store = RoomSyncQueueStore(db.syncDao()) { 1_000L }
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
}
