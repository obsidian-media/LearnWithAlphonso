package com.obsidianmedia.learnwithalphonso.ui.lesson

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.MemorySyncStore
import com.obsidianmedia.learnwithalphonso.PROGRESS_JSON
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.testContent
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LessonViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private val lesson = testContent.findLesson("u1l1", Course.ENGLISH)!!.second
    private var tier: String? = "bronze"

    private fun vm(server: FakeServer, store: MemorySyncStore = MemorySyncStore(), connected: Boolean = true) = LessonViewModel(
        lesson, Course.ENGLISH, testContent, server.progressClient, server.translation, store,
        isConnected = { connected }, lastKnownTier = { tier }, rememberTier = { tier = it }, now = { 42L },
    )

    private fun correctAnswer(q: Question): String = when (q) {
        is Question.MultipleChoice -> q.choices[q.answer]
        is Question.FillInBlank -> q.answer
        is Question.Reorder -> q.answer
        is Question.Listening -> q.answer
        is Question.Speak -> q.answer
        is Question.Translate -> q.acceptableAnswers.first()
    }

    private fun wrongAnswer(q: Question): String = when (q) {
        is Question.MultipleChoice -> q.choices.first { it != q.choices[q.answer] }
        else -> "definitely wrong"
    }

    private fun okServer() = FakeServer { req ->
        when {
            req.path.endsWith("start-lesson-session") -> json("""{"token":"tok"}""")
            req.path.endsWith("complete-lesson") -> json("""{"xpGain":50,"newlyUnlocked":[],"heartsBonus":null,"progress":$PROGRESS_JSON}""")
            req.path.endsWith("lose_heart") -> json("""[{"hearts":3}]""")
            else -> json("[]")
        }
    }

    @Test
    fun `a reinforcement question never enters answers and every real question is answered once`() = runTest {
        val server = okServer()
        val store = MemorySyncStore()
        val v = vm(server, store)
        v.begin(); v.startPractice()
        lesson.questions.forEachIndexed { i, q ->
            val s = v.state.value
            assertEquals(false, s.isReinforcing)
            v.pick(if (i == 1) wrongAnswer(q) else correctAnswer(q))
            v.check()
            advanceUntilIdle()
            if (i == 1) {
                assertNotNull("wrong answer queues a reinforcement", v.state.value.pendingReinforcement)
                v.continueOrFinish()
                assertTrue(v.state.value.isReinforcing)
                v.pick("anything")
                v.check()
                advanceUntilIdle()
                assertEquals("reinforcement not recorded", i + 1, v.state.value.answers.size)
            }
            v.continueOrFinish()
            advanceUntilIdle()
        }
        val finished = v.state.value.phase as LessonPhase.Finished
        assertEquals(50, finished.result.xpGain)
        val completeBody = Json.parseToJsonElement(server.seen.first { it.path.endsWith("complete-lesson") }.body).jsonObject
        val answers = completeBody["answers"]!!.jsonArray
        assertEquals(lesson.questions.size, answers.size)
        assertEquals(lesson.questions.map { it.id }, answers.map { it.jsonObject["questionId"]!!.jsonPrimitive.content })
        assertEquals(lesson.questions.size, completeBody["total"]!!.jsonPrimitive.content.toInt())
        assertEquals(lesson.questions.size - 1, v.state.value.correctCount)
    }

    @Test
    fun `a wrong answer spends a heart locally and on the server`() = runTest {
        val server = okServer()
        val store = MemorySyncStore().apply { updateLastKnownProgress(LessonCompletionProgress(0, 0, 0, null, 4, null, 0, "bronze")) }
        val v = vm(server, store)
        v.begin(); v.startPractice()
        v.pick(wrongAnswer(lesson.questions[0]))
        v.check()
        advanceUntilIdle()
        assertEquals(3, store.lastKnownProgress()!!.hearts)
        assertEquals(1, server.seen.count { it.path.endsWith("lose_heart") })
    }

    @Test
    fun `finishing offline queues the completion with the optimistic xp`() = runTest {
        val store = MemorySyncStore()
        val v = vm(okServer(), store, connected = false)
        v.begin(); v.startPractice()
        lesson.questions.forEach { q ->
            v.pick(correctAnswer(q)); v.check(); advanceUntilIdle(); v.continueOrFinish(); advanceUntilIdle()
        }
        val queued = v.state.value.phase as LessonPhase.QueuedOffline
        assertEquals(lesson.questions.size * 10 + 20, queued.pending.optimisticXpEstimate)
        assertEquals(1, store.completions.size)
        assertEquals(lesson.questions.size, store.completions[0].answers.size)
        assertEquals(42L, store.completions[0].queuedAt)
    }

    @Test
    fun `a server failure on finish also queues offline`() = runTest {
        val server = FakeServer { req ->
            if (req.path.endsWith("start-lesson-session")) json("""{"error":"boom"}""", HttpStatusCode.InternalServerError) else json("[]")
        }
        val store = MemorySyncStore()
        val v = vm(server, store)
        v.begin(); v.startPractice()
        lesson.questions.forEach { q -> v.pick(correctAnswer(q)); v.check(); advanceUntilIdle(); v.continueOrFinish(); advanceUntilIdle() }
        assertTrue(v.state.value.phase is LessonPhase.QueuedOffline)
        assertEquals(1, store.completions.size)
    }

    @Test
    fun `next lesson crosses unit boundaries within a level and is null at the end`() = runTest {
        val v = vm(okServer())
        val unit = testContent.findLesson("u1l1", Course.ENGLISH)!!.first
        assertEquals(unit.lessons[1].id, v.nextLessonId)
        val a1Units = testContent.bundle(Course.ENGLISH).units.filter { it.level == "A1" }
        val lastLesson = a1Units.last().lessons.last()
        val last = LessonViewModel(lastLesson, Course.ENGLISH, testContent, okServer().progressClient, okServer().translation, MemorySyncStore(), { true }, { null }, {}, { 0 })
        assertNull(last.nextLessonId)
        val endOfFirstUnit = LessonViewModel(a1Units[0].lessons.last(), Course.ENGLISH, testContent, okServer().progressClient, okServer().translation, MemorySyncStore(), { true }, { null }, {}, { 0 })
        assertEquals(a1Units[1].lessons.first().id, endOfFirstUnit.nextLessonId)
    }

    @Test
    fun `a league change on finish is reported as a promotion`() = runTest {
        tier = "bronze"
        val server = FakeServer { req ->
            when {
                req.path.endsWith("start-lesson-session") -> json("""{"token":"tok"}""")
                req.path.endsWith("complete-lesson") -> json("""{"xpGain":50,"newlyUnlocked":["first_lesson"],"heartsBonus":"perfect","progress":${PROGRESS_JSON.replace("bronze", "silver")}}""")
                else -> json("[]")
            }
        }
        val v = vm(server)
        v.begin(); v.startPractice()
        lesson.questions.forEach { q -> v.pick(correctAnswer(q)); v.check(); advanceUntilIdle(); v.continueOrFinish(); advanceUntilIdle() }
        val finished = v.state.value.phase as LessonPhase.Finished
        assertTrue(finished.isLeaguePromotion)
        assertEquals("silver", tier)
        assertEquals("perfect", finished.result.heartsBonus)
    }
}
