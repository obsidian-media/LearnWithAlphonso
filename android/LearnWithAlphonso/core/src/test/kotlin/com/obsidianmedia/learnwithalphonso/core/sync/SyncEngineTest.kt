package com.obsidianmedia.learnwithalphonso.core.sync

import com.obsidianmedia.learnwithalphonso.core.logic.ReviewGradeInput
import com.obsidianmedia.learnwithalphonso.core.logic.ReviewOutcome
import com.obsidianmedia.learnwithalphonso.core.logic.computeReviewOutcome
import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase
import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Vectors from SyncEngineTests.swift, plus the plan's Review Focus 2 pin. */
class SyncEngineTest {
    private val now = 1_758_000_000_000L

    private fun completion(lessonId: String, queuedAt: Long) =
        PendingLessonCompletion(lessonId, 5, emptyList(), "en", queuedAt, 50)

    private fun grade(itemKey: String, queuedAt: Long) = PendingReviewGrade(itemKey, "cat", "en", queuedAt)

    private fun progress(xp: Int) =
        """{"xp":$xp,"streak":1,"longestStreak":1,"lastActiveDate":"2026-09-18","hearts":4,"heartsRefillAt":null,"streakFreezes":0,"leagueTier":"bronze"}"""

    private fun lessonIdOf(body: String) = Json.parseToJsonElement(body).jsonObject["lessonId"]!!.jsonPrimitive.content
    private fun itemKeyOf(body: String) = Json.parseToJsonElement(body).jsonObject["itemKey"]!!.jsonPrimitive.content

    @Test
    fun `syncs all pending lesson completions oldest first and returns the latest progress`() = runTest {
        val older = completion("u1l1", now - 60_000)
        val newer = completion("u1l2", now)
        val called = ArrayList<String>()
        val fake = FakeSupabase { req ->
            if (req.path.endsWith("start-lesson-session")) json("""{"token":"tok"}""")
            else {
                val id = lessonIdOf(req.body)
                called.add(id)
                json("""{"xpGain":50,"newlyUnlocked":[],"heartsBonus":null,"progress":${progress(if (id == "u1l2") 150 else 100)}}""")
            }
        }
        val result = SyncEngine.sync(listOf(newer, older), emptyList(), ProgressSyncClient(fake.http) { now })
        assertEquals(listOf("u1l1", "u1l2"), called)
        assertEquals(listOf(older, newer), result.syncedLessonCompletions)
        assertEquals(150, result.lastKnownProgress?.xp)
    }

    @Test
    fun `leaves a failed lesson completion unsynced but still tries the rest`() = runTest {
        val failing = completion("bad", now - 60_000)
        val succeeding = completion("u1l1", now)
        val fake = FakeSupabase { req ->
            if (req.path.endsWith("start-lesson-session")) json("""{"token":"tok"}""")
            else if (lessonIdOf(req.body) == "bad") json("""{"error":"nope"}""", HttpStatusCode.BadRequest)
            else json("""{"xpGain":50,"newlyUnlocked":[],"heartsBonus":null,"progress":${progress(100)}}""")
        }
        val result = SyncEngine.sync(listOf(failing, succeeding), emptyList(), ProgressSyncClient(fake.http) { now })
        assertEquals(listOf(succeeding), result.syncedLessonCompletions)
    }

    @Test
    fun `syncs pending review grades strictly oldest first`() = runTest {
        val older = grade("en:l1:q1", now - 60_000)
        val newer = grade("en:l1:q2", now)
        val called = ArrayList<String>()
        val fake = FakeSupabase { req -> called.add(itemKeyOf(req.body)); json("""{"retired":false,"dueOn":"2026-09-25"}""") }
        val result = SyncEngine.sync(emptyList(), listOf(newer, older), ProgressSyncClient(fake.http) { now })
        assertEquals(listOf("en:l1:q1", "en:l1:q2"), called)
        assertEquals(listOf(older, newer), result.syncedReviewGrades)
    }

    @Test
    fun `stops draining review grades at the first failure to preserve ordering`() = runTest {
        val first = grade("en:l1:q1", now - 60_000)
        val second = grade("en:l1:q2", now)
        val called = ArrayList<String>()
        val fake = FakeSupabase { req -> called.add(itemKeyOf(req.body)); json("""{"error":"not due yet"}""", HttpStatusCode.BadRequest) }
        val result = SyncEngine.sync(emptyList(), listOf(first, second), ProgressSyncClient(fake.http) { now })
        assertEquals(listOf("en:l1:q1"), called)
        assertTrue(result.syncedReviewGrades.isEmpty())
    }

    @Test
    fun `returns null last known progress when no lesson completions were synced`() = runTest {
        val fake = FakeSupabase { json("""{"retired":false,"dueOn":"2026-09-25"}""") }
        val result = SyncEngine.sync(emptyList(), listOf(grade("en:l1:q1", now)), ProgressSyncClient(fake.http) { now })
        assertNull(result.lastKnownProgress)
    }

    @Test
    fun `an offline wrong answer keeps the item due today so the cache must keep it`() {
        // Review Focus 2: the Room layer removes a cached item only when its
        // new dueOn is after today. This is the rule it follows.
        val today = "2026-09-14"
        val wrong = computeReviewOutcome(ReviewGradeInput(false, 2.3, 6, 2, 0, 6), today) { "2026-09-%02d".format(14 + it) }
        val right = computeReviewOutcome(ReviewGradeInput(true, 2.3, 0, 0, 0, 0), today) { "2026-09-%02d".format(14 + it) }
        assertEquals(today, wrong.dueOn)
        assertTrue(right.dueOn > today)
        assertTrue(wrong is ReviewOutcome.Rescheduled)
    }
}
