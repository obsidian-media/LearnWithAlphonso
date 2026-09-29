package com.obsidianmedia.learnwithalphonso.ui.review

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.MemorySyncStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import com.obsidianmedia.learnwithalphonso.testContent
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ReviewViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private val lesson = testContent.findLesson("u1l1", Course.ENGLISH)!!.second
    private val q1 = lesson.questions[0] as Question.MultipleChoice
    private val q2 = lesson.questions[1] as Question.FillInBlank
    private val now = 1_758_000_000_000L // 2025-09-16 UTC

    private fun item(q: Question, ease: Double = 2.3, interval: Int = 6, reps: Int = 2) =
        ReviewItem("en:u1l1:${q.id}", "u1l1", "A1", ease, interval, reps, "2025-09-16")

    private fun dueJson(vararg items: ReviewItem) = items.joinToString(",", "[", "]") {
        """{"item_key":"${it.itemKey}","lesson_id":"${it.lessonId}","level":"A1","ease":${it.ease},"interval_days":${it.intervalDays},"repetitions":${it.repetitions},"due_on":"${it.dueOn}"}"""
    }

    private fun server(items: List<ReviewItem>, gradeOk: Boolean = true, bonusGranted: Boolean = false) = FakeServer { req ->
        when {
            req.method == "HEAD" -> respond("", HttpStatusCode.OK, headersOf("Content-Range", "0-1/${items.size}"))
            req.path.endsWith("review_items") -> json(dueJson(*items.toTypedArray()))
            req.path.endsWith("grade-review") -> if (gradeOk) json("""{"retired":false,"dueOn":"2025-09-19","correct":true}""") else json("""{"error":"down"}""", HttpStatusCode.InternalServerError)
            req.path.endsWith("claim_review_clear_bonus") -> json("""[{"granted":$bonusGranted,"hearts":5}]""")
            else -> json("[]")
        }
    }

    private fun vm(s: FakeServer, store: MemorySyncStore = MemorySyncStore(), connected: Boolean = true) =
        ReviewViewModel(testContent, s.progressClient, store, { connected }, Course.ENGLISH) { now }

    @Test
    fun `online grade posts to grade-review, advances, and claims the bonus on the last item`() = runTest {
        val s = server(listOf(item(q1)), bonusGranted = true)
        val store = MemorySyncStore()
        val v = vm(s, store)
        advanceUntilIdle()
        assertEquals(1, v.state.value.queue.size)
        assertEquals(1, store.lastKnownDueReviews().size)
        v.pick(q1.choices[q1.answer]); v.check(); v.next()
        advanceUntilIdle()
        assertTrue(v.state.value.isDone)
        assertTrue(s.paths().any { it.endsWith("grade-review") })
        assertTrue(s.paths().any { it.endsWith("claim_review_clear_bonus") })
        assertEquals("Review queue cleared: +1 heart!", v.state.value.clearedBonusMessage)
        assertTrue(store.grades.isEmpty())
    }

    @Test
    fun `offline wrong answer queues the grade and keeps the item cached, right answer removes it`() = runTest {
        // Review Focus 2.
        val store = MemorySyncStore().apply { replaceLastKnownDueReviews(listOf(item(q1), item(q2))); syncedAt = 5L }
        val v = vm(server(emptyList()), store, connected = false)
        advanceUntilIdle()
        assertEquals(2, v.state.value.queue.size)
        assertEquals(5L, v.state.value.showingCachedSince)
        v.pick(q1.choices.first { it != q1.choices[q1.answer] }); v.check(); v.next()
        advanceUntilIdle()
        assertEquals(1, store.grades.size)
        assertEquals(2, store.lastKnownDueReviews().size)
        v.pick(q2.answer); v.check(); v.next()
        advanceUntilIdle()
        assertEquals(2, store.grades.size)
        assertEquals(listOf("en:u1l1:${q1.id}"), store.lastKnownDueReviews().map { it.itemKey })
        assertTrue(v.state.value.isDone)
    }

    @Test
    fun `a failed online grade falls back to the offline queue`() = runTest {
        val s = server(listOf(item(q1)), gradeOk = false)
        val store = MemorySyncStore()
        val v = vm(s, store)
        advanceUntilIdle()
        v.pick(q1.choices[q1.answer]); v.check(); v.next()
        advanceUntilIdle()
        assertEquals(1, store.grades.size)
        assertTrue(v.state.value.isDone)
    }

    @Test
    fun `a weakness item with missing fields is unresolvable and skipped, not a crash`() = runTest {
        val broken = ReviewItem("weak:1", "u1l1", "A1", 2.5, 1, 0, "2025-09-16", source = "weakness", prompt = "p", choices = null, answerIndex = 0, explanation = "e")
        val s = FakeServer { req ->
            when {
                req.method == "HEAD" -> respond("", HttpStatusCode.OK, headersOf("Content-Range", "0-0/1"))
                req.path.endsWith("review_items") -> json("""[{"item_key":"weak:1","lesson_id":"u1l1","level":"A1","ease":2.5,"interval_days":1,"repetitions":0,"due_on":"2025-09-16","source":"weakness","prompt":"p","answer_index":0,"explanation":"e"}]""")
                else -> json("[]")
            }
        }
        val v = vm(s)
        advanceUntilIdle()
        assertNull(v.questionFor(broken))
        v.skipUnresolvable()
        assertTrue(v.state.value.isDone)
    }

    @Test
    fun `a weakness item with all fields becomes a multiple choice question`() = runTest {
        val v = vm(server(emptyList()))
        advanceUntilIdle()
        val full = ReviewItem("weak:2", "u1l1", "A1", 2.5, 1, 0, "2025-09-16", source = "weakness", prompt = "Pick", choices = listOf("a", "b"), answerIndex = 1, explanation = "why")
        val q = v.questionFor(full)
        assertNotNull(q)
        assertEquals("weak:2", q!!.id)
    }
}
