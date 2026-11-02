package com.obsidianmedia.learnwithalphonso.core.sync

import com.obsidianmedia.learnwithalphonso.core.logic.HeartsEconomy
import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase
import com.obsidianmedia.learnwithalphonso.core.net.LessonAnswer
import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncError
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException
import java.net.SocketTimeoutException

/** The failure handling ported from iOS #261, #284 and #291: classify, back off, dead-letter, drop foreign rows. */
class SyncReliabilityTest {
    private val now = 1_758_000_000_000L
    private val progress = """{"xp":100,"streak":1,"longestStreak":1,"lastActiveDate":"2026-09-18","hearts":4,"heartsRefillAt":null,"streakFreezes":0,"leagueTier":"bronze"}"""
    private val done = """{"xpGain":50,"newlyUnlocked":[],"heartsBonus":null,"progress":$progress}"""

    private fun completion(id: String = "u1l1", queuedAt: Long = now - 1000, owner: String? = null, attempts: Int = 0, next: Long? = null, token: String? = null) =
        PendingLessonCompletion(id, 5, emptyList(), "en", queuedAt, 50, owner, token, attempts, next)

    private fun grade(key: String = "en:l1:q1", queuedAt: Long = now - 1000, owner: String? = null, attempts: Int = 0, next: Long? = null) =
        PendingReviewGrade(key, "cat", "en", queuedAt, owner, attempts, next)

    private suspend fun sync(fake: FakeSupabase, completions: List<PendingLessonCompletion> = emptyList(), grades: List<PendingReviewGrade> = emptyList(), user: String? = "u1") =
        SyncEngine.sync(completions, grades, ProgressSyncClient(fake.http) { now }, user, now)

    private fun lessonServer(start: () -> Pair<String, HttpStatusCode> = { """{"token":"tok"}""" to HttpStatusCode.OK }, complete: () -> Pair<String, HttpStatusCode> = { done to HttpStatusCode.OK }) =
        FakeSupabase { req ->
            val (body, status) = if (req.path.endsWith("start-lesson-session")) start() else complete()
            json(body, status)
        }

    // ---- classification

    @Test
    fun `each cause is classified once, by its real meaning`() {
        assertEquals(LessonCompletionError.Unauthorized, LessonCompletionError.classify(401, "x"))
        assertEquals(LessonCompletionError.Timeout, LessonCompletionError.classify(408, null))
        assertEquals(LessonCompletionError.Server(429), LessonCompletionError.classify(429, null))
        assertEquals(LessonCompletionError.Server(503), LessonCompletionError.classify(503, null))
        assertEquals(LessonCompletionError.Rejected("lesson-version-mismatch"), LessonCompletionError.classify(409, "lesson-version-mismatch"))
        assertEquals(LessonCompletionError.Rejected(null), LessonCompletionError.classify(400, "Something went wrong here"), "a sentence is not a code")
        assertEquals(LessonCompletionError.Offline, LessonCompletionError.classify(IOException("no route")))
        assertEquals(LessonCompletionError.Timeout, LessonCompletionError.classify(SocketTimeoutException("slow")))
        assertEquals(LessonCompletionError.Rejected("out-of-hearts"), LessonCompletionError.classify(ProgressSyncError.OutOfHearts(null)))
        assertEquals(LessonCompletionError.Server(502), LessonCompletionError.classify(ProgressSyncError.InvalidPayload()), "an unreadable 2xx may have been recorded")
        assertEquals(LessonCompletionError.Server(500), LessonCompletionError.classify(IllegalStateException("bug")))
    }

    @Test
    fun `only waiting-fixable causes are queued, a rejection is never called offline`() {
        listOf(LessonCompletionError.Offline, LessonCompletionError.Timeout, LessonCompletionError.Server(503)).forEach {
            assertTrue(it.shouldQueue, it.reasonCode)
            assertEquals(LessonCompletionError.FinishDisposition.QUEUE, it.finishDisposition)
        }
        listOf(LessonCompletionError.Unauthorized, LessonCompletionError.Rejected(null), LessonCompletionError.Rejected("lesson-version-mismatch"), LessonCompletionError.InvalidPayload).forEach {
            assertFalse(it.shouldQueue, it.reasonCode)
            assertEquals(LessonCompletionError.FinishDisposition.SHOW_FAILURE, it.finishDisposition)
        }
        // Out of hearts is still a good attempt: it is queued and sync defers it until a refill.
        assertEquals(LessonCompletionError.FinishDisposition.QUEUE, LessonCompletionError.Rejected("out-of-hearts").finishDisposition)
    }

    @Test
    fun `the learner copy matches iOS, with a support line only when waiting cannot fix it`() {
        assertEquals("Saved. It will sync when you're back online.", LessonCompletionError.Offline.userMessage)
        assertEquals("The server took too long to answer. Your lesson is saved and will sync automatically.", LessonCompletionError.Timeout.userMessage)
        assertEquals("Our server had a problem. Your lesson is saved and will sync automatically.", LessonCompletionError.Server(503).userMessage)
        assertEquals("You've been signed out, so this lesson couldn't be saved. Sign in to keep learning.", LessonCompletionError.Unauthorized.userMessage)
        assertEquals("This lesson changed since you started it, so this attempt can't be saved. Update the app, then try the lesson again.", LessonCompletionError.Rejected("lesson-version-mismatch").userMessage)
        assertEquals("Saved. It will sync when your hearts refill.", LessonCompletionError.Rejected("out-of-hearts").userMessage)
        assertEquals("We couldn't save this lesson.", LessonCompletionError.Rejected(null).userMessage)
        assertNull(LessonCompletionError.Offline.supportLine)
        assertNull(LessonCompletionError.Server(500).supportLine)
        assertEquals("If this keeps happening, email support@alphonsoecosystem.app.", LessonCompletionError.Rejected(null).supportLine)
    }

    @Test
    fun `reason codes are stable and never shown`() {
        assertEquals("offline", LessonCompletionError.Offline.reasonCode)
        assertEquals("server-503", LessonCompletionError.Server(503).reasonCode)
        assertEquals("rejected", LessonCompletionError.Rejected(null).reasonCode)
        assertEquals("lesson-version-mismatch", LessonCompletionError.Rejected("lesson-version-mismatch").reasonCode)
        assertEquals("timeout", LessonCompletionError.Timeout.reasonCode)
    }

    // ---- backoff

    @Test
    fun `backoff doubles from 30 seconds and stops at six hours`() {
        val p = SyncRetryPolicy.STANDARD
        assertEquals(30_000L, p.delayMillis(1))
        assertEquals(60_000L, p.delayMillis(2))
        assertEquals(120_000L, p.delayMillis(3))
        assertEquals(6L * 60 * 60 * 1000, p.delayMillis(20))
        assertEquals(6L * 60 * 60 * 1000, p.delayMillis(1000))
        assertEquals(30_000L, p.delayMillis(0), "an attempt count below one still waits the base delay")
    }

    // ---- lesson completions

    @Test
    fun `server trouble backs the row off and keeps it, however many times it fails`() = runTest {
        val fake = lessonServer(start = { """{"error":"overloaded"}""" to HttpStatusCode.ServiceUnavailable })
        val first = sync(fake, listOf(completion()))
        val r1 = first.rescheduledLessonCompletions.single()
        assertEquals(1, r1.attemptCount)
        assertEquals(now + 30_000, r1.nextAttemptAt)
        assertTrue(first.deadLetteredLessonCompletions.isEmpty())
        val second = sync(fake, listOf(r1.copy(nextAttemptAt = now - 1)))
        assertEquals(2, second.rescheduledLessonCompletions.single().attemptCount)
        assertEquals(now + 60_000, second.rescheduledLessonCompletions.single().nextAttemptAt)
        val late = sync(fake, listOf(completion(attempts = 40, next = now - 1)))
        assertEquals(now + 6L * 60 * 60 * 1000, late.rescheduledLessonCompletions.single().nextAttemptAt)
        assertTrue(late.deadLetteredLessonCompletions.isEmpty(), "transient failures never dead-letter")
    }

    @Test
    fun `no connection waits the shortest delay and earns no growing backoff`() = runTest {
        val fake = FakeSupabase { throw IOException("offline") }
        val result = sync(fake, listOf(completion(attempts = 3, next = now - 1)))
        val row = result.rescheduledLessonCompletions.single()
        assertEquals(3, row.attemptCount, "the failure count is left alone")
        assertEquals(now + 30_000, row.nextAttemptAt)
        assertTrue(result.deadLetteredLessonCompletions.isEmpty())
    }

    @Test
    fun `a timeout is transient and backs off`() = runTest {
        val fake = FakeSupabase { throw SocketTimeoutException("slow") }
        val row = sync(fake, listOf(completion())).rescheduledLessonCompletions.single()
        assertEquals(1, row.attemptCount)
        assertEquals(now + 30_000, row.nextAttemptAt)
    }

    @Test
    fun `a permanent rejection is dead-lettered with its reason and does not block the next row`() = runTest {
        val fake = FakeSupabase { req ->
            when {
                req.path.endsWith("start-lesson-session") -> json("""{"token":"tok"}""")
                Json.parseToJsonElement(req.body).jsonObject["lessonId"]!!.jsonPrimitive.content == "u1l1" -> json("""{"error":"lesson-version-mismatch"}""", HttpStatusCode.Conflict)
                else -> json(done)
            }
        }
        val result = sync(fake, listOf(completion("u1l1", now - 2000), completion("u1l2", now - 1000)))
        assertEquals(listOf("u1l2"), result.syncedLessonCompletions.map { it.lessonId })
        val dead = result.deadLetteredLessonCompletions.single()
        assertEquals("u1l1", dead.item.lessonId)
        assertEquals("lesson-version-mismatch", dead.reason)
    }

    @Test
    fun `a 4xx with prose instead of a code is rejected under a generic reason`() = runTest {
        val fake = lessonServer(complete = { """{"error":"Bad things happened"}""" to HttpStatusCode.BadRequest })
        assertEquals("rejected", sync(fake, listOf(completion())).deadLetteredLessonCompletions.single().reason)
    }

    @Test
    fun `out of hearts waits for a refill without spending an attempt`() = runTest {
        val fake = lessonServer(start = { """{"error":"out-of-hearts","refillAt":null}""" to HttpStatusCode.Conflict })
        val row = sync(fake, listOf(completion(attempts = 2))).rescheduledLessonCompletions.single()
        assertEquals(2, row.attemptCount)
        assertEquals(now + HeartsEconomy.HEART_REFILL_MS, row.nextAttemptAt)
    }

    @Test
    fun `a 401 leaves the row untouched`() = runTest {
        val fake = lessonServer(start = { """{"message":"JWT expired"}""" to HttpStatusCode.Unauthorized })
        val result = sync(fake, listOf(completion()))
        assertTrue(result.syncedLessonCompletions.isEmpty() && result.rescheduledLessonCompletions.isEmpty() && result.deadLetteredLessonCompletions.isEmpty())
    }

    @Test
    fun `a row waiting out its backoff is not sent, one that is due is`() = runTest {
        val fake = lessonServer()
        val result = sync(fake, listOf(completion("waiting", next = now + 60_000), completion("due", next = now - 1)))
        assertEquals(listOf("due"), result.syncedLessonCompletions.map { it.lessonId })
        assertEquals(1, fake.seen.count { it.path.endsWith("complete-lesson") })
    }

    @Test
    fun `a row another account queued is dropped and never sent`() = runTest {
        val fake = lessonServer()
        val result = sync(fake, listOf(completion("theirs", owner = "u2"), completion("mine", owner = "u1"), completion("legacy", owner = null)), user = "u1")
        assertEquals(listOf("theirs"), result.droppedForeignLessonCompletions.map { it.lessonId })
        assertEquals(setOf("mine", "legacy"), result.syncedLessonCompletions.map { it.lessonId }.toSet())
        assertTrue(fake.seen.none { it.body.contains("theirs") })
    }

    @Test
    fun `a held session token is used as is, and a stale one is replaced once`() = runTest {
        var completes = 0
        val fake = FakeSupabase { req ->
            when {
                req.path.endsWith("start-lesson-session") -> json("""{"token":"fresh"}""")
                else -> {
                    completes++
                    if (completes == 1) json("""{"error":"Invalid or expired lesson session"}""", HttpStatusCode.Forbidden) else json(done)
                }
            }
        }
        val result = sync(fake, listOf(completion(token = "held")))
        assertEquals(1, result.syncedLessonCompletions.size)
        val bodies = fake.seen.filter { it.path.endsWith("complete-lesson") }.map { Json.parseToJsonElement(it.body).jsonObject["sessionToken"]!!.jsonPrimitive.content }
        assertEquals(listOf("held", "fresh"), bodies)
        assertEquals(1, fake.seen.count { it.path.endsWith("start-lesson-session") })
    }

    @Test
    fun `a 403 on a token minted just now is not retried forever`() = runTest {
        // The server's real 403 body is a sentence, not a code: it dead-letters with the generic reason.
        val fake = lessonServer(complete = { """{"error":"Invalid or expired lesson session"}""" to HttpStatusCode.Forbidden })
        val result = sync(fake, listOf(completion(token = null)))
        assertEquals("rejected", result.deadLetteredLessonCompletions.single().reason)
        assertEquals(1, fake.seen.count { it.path.endsWith("complete-lesson") })
    }

    // ---- review grades

    private fun gradeKey(body: String) = Json.parseToJsonElement(body).jsonObject["itemKey"]!!.jsonPrimitive.content

    @Test
    fun `a grade is sent with its stable identity as the attempt id`() = runTest {
        val fake = FakeSupabase { json("""{"retired":false,"dueOn":"2026-09-19"}""") }
        val g = grade()
        sync(fake, grades = listOf(g))
        val body = Json.parseToJsonElement(fake.seen.single().body).jsonObject
        assertEquals(g.queueIdentity, body["attemptId"]!!.jsonPrimitive.content)
        assertEquals("en:l1:q1|en|${g.queuedAt}", g.queueIdentity)
        // A retry carries the same id.
        assertEquals(g.queueIdentity, g.rescheduled(1, now + 30_000).queueIdentity)
    }

    @Test
    fun `a permanently rejected grade is dead-lettered and the next one continues`() = runTest {
        val fake = FakeSupabase { req -> if (gradeKey(req.body) == "k1") json("""{"error":"not-due"}""", HttpStatusCode.BadRequest) else json("""{"retired":false,"dueOn":"2026-09-19"}""") }
        val result = sync(fake, grades = listOf(grade("k1", now - 2000), grade("k2", now - 1000)))
        assertEquals("not-due", result.deadLetteredReviewGrades.single().reason)
        assertEquals(listOf("k2"), result.syncedReviewGrades.map { it.itemKey })
    }

    @Test
    fun `no connection stops the grades with the shortest wait and no backoff growth`() = runTest {
        val called = ArrayList<String>()
        val fake = FakeSupabase { req -> called.add(gradeKey(req.body)); throw IOException("offline") }
        val result = sync(fake, grades = listOf(grade("k1", now - 2000, attempts = 4), grade("k2", now - 1000)))
        assertEquals(listOf("k1"), called)
        val row = result.rescheduledReviewGrades.single()
        assertEquals(4, row.attemptCount)
        assertEquals(now + 30_000, row.nextAttemptAt)
    }

    @Test
    fun `a grade waiting out its backoff holds back every later grade`() = runTest {
        val fake = FakeSupabase { json("""{"retired":false,"dueOn":"2026-09-19"}""") }
        val result = sync(fake, grades = listOf(grade("k1", now - 2000, next = now + 60_000), grade("k2", now - 1000)))
        assertTrue(result.syncedReviewGrades.isEmpty())
        assertTrue(fake.seen.isEmpty(), "SM-2 order: grade 2 must not land before grade 1")
    }

    @Test
    fun `a foreign grade is dropped, never sent, and does not hold back mine`() = runTest {
        val fake = FakeSupabase { json("""{"retired":false,"dueOn":"2026-09-19"}""") }
        val result = sync(fake, grades = listOf(grade("theirs", now - 2000, owner = "u2"), grade("mine", now - 1000, owner = "u1")))
        assertEquals(listOf("theirs"), result.droppedForeignReviewGrades.map { it.itemKey })
        assertEquals(listOf("mine"), result.syncedReviewGrades.map { it.itemKey })
        assertEquals(listOf("mine"), fake.seen.map { gradeKey(it.body) })
    }

    @Test
    fun `a 401 on a grade stops the drain and leaves everything in place`() = runTest {
        val fake = FakeSupabase { json("""{"message":"JWT expired"}""", HttpStatusCode.Unauthorized) }
        val result = sync(fake, grades = listOf(grade("k1", now - 2000), grade("k2", now - 1000)))
        assertEquals(1, fake.seen.size)
        assertTrue(result.syncedReviewGrades.isEmpty() && result.rescheduledReviewGrades.isEmpty() && result.deadLetteredReviewGrades.isEmpty())
    }

    // ---- the wake-up timer

    @Test
    fun `the next wake-up is the earliest due lesson or the oldest grade, for my rows and unowned ones`() {
        val lessons = listOf(completion("a", owner = "u1", next = now + 120_000), completion("b", owner = "u1", next = now + 60_000), completion("c", owner = "u2", next = now + 1_000))
        val grades = listOf(grade("g1", queuedAt = 1, owner = "u1", next = now + 90_000), grade("g2", queuedAt = 2, owner = "u1", next = now + 10_000))
        // Grades go strictly oldest first, so only g1's time counts; g2 cannot go before it.
        assertEquals(now + 60_000, SyncWakeup.nextPendingAttempt("u1", lessons, grades, now))
        assertEquals(now + 90_000, SyncWakeup.nextPendingAttempt("u1", emptyList(), grades, now))
        assertEquals(now, SyncWakeup.nextPendingAttempt("u1", listOf(completion("legacy", owner = null)), emptyList(), now), "a row with no owner counts and is due now")
        assertNull(SyncWakeup.nextPendingAttempt("u1", listOf(completion("c", owner = "u2")), emptyList(), now))
        assertNull(SyncWakeup.nextPendingAttempt("u1", emptyList(), emptyList(), now))
    }

    @Test
    fun `the wake-up never fires sooner than the floor, which stops a loop`() {
        assertEquals(30_000L, SyncWakeup.delayMillis(now - 5_000, now))
        assertEquals(30_000L, SyncWakeup.delayMillis(now, now))
        assertEquals(45_000L, SyncWakeup.delayMillis(now + 45_000, now))
    }

    // ---- notices

    @Test
    fun `the pending line counts lessons and review answers and says when it will sync`() {
        assertNull(PendingSyncNotice.message(0, 0, true))
        assertEquals("1 lesson is saved on this phone and waiting to sync.", PendingSyncNotice.message(1, 0, true))
        assertEquals("2 lessons and 3 review answers are saved on this phone and waiting to sync.", PendingSyncNotice.message(2, 3, true))
        assertEquals("1 review answer is saved on this phone and waiting to sync. It will sync when you're back online.", PendingSyncNotice.message(0, 1, false))
        assertEquals("1 lesson and 1 review answer are saved on this phone and waiting to sync. They will sync when you're back online.", PendingSyncNotice.message(1, 1, false))
    }

    @Test
    fun `the dead-letter notice counts what is not dismissed and builds a support mail`() {
        assertEquals(listOf("b"), DeadLetterNotice.visible(listOf("a", "b"), setOf("a")))
        assertNull(DeadLetterNotice.message(0))
        assertEquals("1 lesson couldn't be saved. Contact support.", DeadLetterNotice.message(1))
        assertEquals("3 lessons couldn't be saved. Contact support.", DeadLetterNotice.message(3))
        val uri = DeadLetterNotice.supportMailUri(listOf("u1l1|en|10"), listOf("lesson-version-mismatch"), "1.2.3")
        assertTrue(uri.startsWith("mailto:support@alphonsoecosystem.app?subject=A%20lesson%20couldn%27t%20be%20saved&body="), uri)
        assertTrue(uri.contains("u1l1%7Cen%7C10%20%28lesson-version-mismatch%29"), uri)
        assertTrue(uri.contains("App%3A%201.2.3"), uri)
    }

    @Test
    fun `a 401 that survives the refresh is connection trouble while the session is still there, signed out only when it is gone`() {
        assertEquals(LessonCompletionError.Offline, LessonCompletionError.Unauthorized.whileSession(stillSignedIn = true))
        assertEquals(LessonCompletionError.Unauthorized, LessonCompletionError.Unauthorized.whileSession(stillSignedIn = false))
        // Only a 401 is reinterpreted: a rejection stays a rejection however the session looks.
        val rejected = LessonCompletionError.Rejected("lesson-version-mismatch")
        assertEquals(rejected, rejected.whileSession(stillSignedIn = true))
        assertTrue(LessonCompletionError.Unauthorized.whileSession(stillSignedIn = true).shouldQueue)
    }

    @Test
    fun `dismissals are only forgotten against a non-empty list of dead letters`() {
        val dismissed = setOf("a", "b")
        // The Learn tab's flow starts empty before its first read: that says nothing about what exists.
        assertEquals(dismissed, DeadLetterNotice.reconcile(dismissed, emptyList()))
        assertEquals(setOf("a"), DeadLetterNotice.reconcile(dismissed, listOf("a", "c")))
    }

    @Test
    fun `a pass stops sending once the account is no longer the current one`() = runTest {
        val fake = lessonServer()
        var current = true
        // The first row's request is the last one: after it the account changes.
        val real = ProgressSyncClient(fake.http) { now }
        val client = object : SyncApi {
            override suspend fun startLessonSession(lessonId: String, course: String) = real.startLessonSession(lessonId, course)
            override suspend fun completeLesson(lessonId: String, total: Int, answers: List<LessonAnswer>, course: String, sessionToken: String, completedAt: Long?) =
                real.completeLesson(lessonId, total, answers, course, sessionToken, completedAt).also { current = false }
            override suspend fun gradeReview(itemKey: String, answer: String, course: String, attemptId: String?, expectedDueOn: String?, expectedLastReviewedAt: String?) {
                real.gradeReview(itemKey, answer, course, attemptId, expectedDueOn, expectedLastReviewedAt)
            }
        }
        val result = SyncEngine.sync(
            listOf(completion("a", queuedAt = now - 2000, owner = "u1"), completion("b", queuedAt = now - 1000, owner = "u1")),
            listOf(grade(owner = "u1")), client, "u1", now, isCurrentAccount = { current },
        )
        assertEquals(listOf("a"), result.syncedLessonCompletions.map { it.lessonId })
        assertEquals(0, result.syncedReviewGrades.size, "the grade was not sent either")
        assertEquals(1, fake.seen.count { it.path.endsWith("complete-lesson") })
    }

    @Test
    fun `a review grade is not sent once the account is no longer the current one`() = runTest {
        val fake = lessonServer()
        SyncEngine.sync(emptyList(), listOf(grade(owner = "u1")), ProgressSyncClient(fake.http) { now }.let { ProgressSyncApi(it) }, "u1", now, isCurrentAccount = { false })
        assertEquals(0, fake.seen.size, "no request left for an account that is no longer signed in")
    }
}
