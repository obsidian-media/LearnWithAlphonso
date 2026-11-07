package com.obsidianmedia.learnwithalphonso.ui.lesson

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.MemorySyncStore
import com.obsidianmedia.learnwithalphonso.PROGRESS_JSON
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.logic.LessonPreviousBest
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.testContent
import com.obsidianmedia.learnwithalphonso.core.sound.SoundEffect
import com.obsidianmedia.learnwithalphonso.core.sound.SoundEffectRequest
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
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

class LessonViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private val lesson = testContent.findLesson("u1l1", Course.ENGLISH)!!.second
    private var tier: String? = "bronze"

    private fun vm(server: FakeServer, store: MemorySyncStore = MemorySyncStore(), connected: Boolean = true, owner: String? = "u1", pro: Boolean = false) = LessonViewModel(
        lesson, Course.ENGLISH, testContent, server.progressClient, server.translation, store,
        isConnected = { connected }, lastKnownTier = { tier }, rememberTier = { tier = it }, now = { 42L }, hasAiConsent = { true },
        ownerUserId = { owner }, isPro = { pro },
    )

    private suspend fun playThrough(v: LessonViewModel) {
        v.begin(); v.startPractice()
        lesson.questions.forEach { q -> v.pick(correctAnswer(q)); v.check().join(); awaitTrue("checked") { v.state.value.checked }; v.continueOrFinish() }
    }

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
    fun `a reinforcement question never enters answers and every real question is answered once`() = runBlocking {
        val server = okServer()
        val store = MemorySyncStore()
        val v = vm(server, store)
        v.begin(); v.startPractice()
        lesson.questions.forEachIndexed { i, q ->
            val s = v.state.value
            assertEquals(false, s.isReinforcing)
            v.pick(if (i == 1) wrongAnswer(q) else correctAnswer(q))
            v.check()
            awaitTrue("checked") { v.state.value.checked }
            if (i == 1) {
                assertNotNull("wrong answer queues a reinforcement", v.state.value.pendingReinforcement)
                v.continueOrFinish()
                assertTrue(v.state.value.isReinforcing)
                v.pick("anything")
                v.check()
                awaitTrue("reinforcement checked") { v.state.value.checked }
                assertEquals("reinforcement not recorded", i + 1, v.state.value.answers.size)
            }
            v.continueOrFinish()
        }
        awaitTrue("finished") { v.state.value.phase is LessonPhase.Finished }
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
    fun `a second Finish while the completion is in flight completes the lesson once`() = runBlocking {
        val server = okServer()
        val v = vm(server)
        v.begin(); v.startPractice()
        lesson.questions.forEachIndexed { i, q ->
            v.pick(correctAnswer(q)); v.check().join(); awaitTrue("checked") { v.state.value.checked }
            v.continueOrFinish()
            if (i == lesson.questions.lastIndex) v.continueOrFinish()
        }
        awaitTrue("finished") { v.state.value.phase is LessonPhase.Finished }
        delay(100)
        assertEquals(1, server.seen.count { it.path.endsWith("complete-lesson") })
    }

    @Test
    fun `a replay shows XP only past the best earlier score, a first try on every right answer`() = runBlocking {
        val replay = FakeServer { req ->
            when {
                req.path.endsWith("start-lesson-session") -> json("""{"token":"tok"}""")
                req.path.endsWith("lesson_completions") -> json("""[{"correct":1}]""")
                else -> json("[]")
            }
        }
        val v = vm(replay)
        v.onScreenShown()
        awaitTrue("best read") { v.state.value.previousBest == LessonPreviousBest.Best(1) }
        v.begin(); v.startPractice()
        val chips = lesson.questions.take(3).map { q ->
            v.pick(correctAnswer(q)); v.check().join(); awaitTrue("checked") { v.state.value.checked }
            v.answerXp().also { v.continueOrFinish() }
        }
        assertEquals(listOf(null, 10, 10), chips)

        val first = vm(okServer())
        first.onScreenShown()
        awaitTrue("first try") { first.state.value.previousBest == LessonPreviousBest.FirstTry }
        first.begin(); first.startPractice()
        first.pick(correctAnswer(lesson.questions[0])); first.check().join()
        assertEquals(10, first.answerXp())
    }

    @Test
    fun `an unreadable history promises no XP, and a wrong answer never shows any`() = runBlocking {
        val v = vm(okServer(), connected = false)
        v.begin(); v.startPractice()
        v.pick(correctAnswer(lesson.questions[0])); v.check().join()
        assertEquals(LessonPreviousBest.Unknown, v.state.value.previousBest)
        assertNull(v.answerXp())
        val w = vm(okServer())
        w.onScreenShown()
        awaitTrue("first try") { w.state.value.previousBest == LessonPreviousBest.FirstTry }
        w.begin(); w.startPractice()
        w.pick(wrongAnswer(lesson.questions[0])); w.check().join()
        assertNull(w.answerXp())
        assertEquals(1, w.state.value.missed.size)
    }

    @Test
    fun `the lesson's time leaves out the time the app was in the background`() = runBlocking {
        var clock = 0L
        val v = LessonViewModel(
            lesson, Course.ENGLISH, testContent, okServer().progressClient, okServer().translation, MemorySyncStore(),
            isConnected = { true }, lastKnownTier = { tier }, rememberTier = { tier = it }, now = { clock }, hasAiConsent = { true },
            ownerUserId = { "u1" },
        )
        v.begin(); v.startPractice()
        clock = 10_000; v.onAppVisible(false)
        clock = 70_000; v.onAppVisible(true)
        clock = 80_000
        lesson.questions.forEach { q -> v.pick(correctAnswer(q)); v.check().join(); awaitTrue("checked") { v.state.value.checked }; v.continueOrFinish() }
        awaitTrue("finished") { v.state.value.phase is LessonPhase.Finished }
        assertEquals(20_000L, v.state.value.elapsedMs)
    }

    @Test
    fun `a wrong answer spends a heart locally and on the server`() = runBlocking {
        val server = okServer()
        val store = MemorySyncStore().apply { updateLastKnownProgress(LessonCompletionProgress(0, 0, 0, null, 4, null, 0, "bronze")) }
        val v = vm(server, store)
        v.begin(); v.startPractice()
        v.pick(wrongAnswer(lesson.questions[0]))
        v.check()
        awaitTrue("lose_heart call") { server.seen.count { it.path.endsWith("lose_heart") } == 1 }
        assertEquals(3, store.lastKnownProgress()!!.hearts)
    }

    @Test
    fun `finishing offline queues the completion with the optimistic xp`() = runBlocking {
        val store = MemorySyncStore()
        val v = vm(okServer(), store, connected = false)
        v.begin(); v.startPractice()
        lesson.questions.forEach { q ->
            v.pick(correctAnswer(q)); v.check(); awaitTrue("checked") { v.state.value.checked }; v.continueOrFinish()
        }
        awaitTrue("queued offline") { v.state.value.phase is LessonPhase.QueuedOffline }
        val queued = v.state.value.phase as LessonPhase.QueuedOffline
        assertEquals(lesson.questions.size * 10 + 20, queued.pending.optimisticXpEstimate)
        assertEquals(1, store.completions.size)
        assertEquals(lesson.questions.size, store.completions[0].answers.size)
        assertEquals(42L, store.completions[0].queuedAt)
    }

    @Test
    fun `a rejected finish is never queued or called offline, it says why`() = runBlocking {
        val server = FakeServer { req ->
            when {
                req.path.endsWith("start-lesson-session") -> json("""{"token":"tok"}""")
                req.path.endsWith("complete-lesson") -> json("""{"error":"lesson-version-mismatch"}""", HttpStatusCode.Conflict)
                else -> json("[]")
            }
        }
        val store = MemorySyncStore()
        val v = vm(server, store)
        playThrough(v)
        awaitTrue("failure shown") { v.state.value.phase is LessonPhase.SaveFailed }
        val failed = v.state.value.phase as LessonPhase.SaveFailed
        assertEquals("This lesson changed since you started it, so this attempt can't be saved. Update the app, then try the lesson again.", failed.message)
        assertEquals("If this keeps happening, email support@alphonsoecosystem.app.", failed.supportLine)
        assertTrue("nothing a retry could fix is queued", store.completions.isEmpty())
    }

    @Test
    fun `server trouble at the finish is queued with the owner, and says it is saved`() = runBlocking {
        val server = FakeServer { req ->
            when {
                req.path.endsWith("start-lesson-session") -> json("""{"token":"tok"}""")
                req.path.endsWith("complete-lesson") -> json("""{"error":"overloaded"}""", HttpStatusCode.ServiceUnavailable)
                else -> json("[]")
            }
        }
        val store = MemorySyncStore()
        val v = vm(server, store)
        playThrough(v)
        awaitTrue("queued") { v.state.value.phase is LessonPhase.QueuedOffline }
        val queued = v.state.value.phase as LessonPhase.QueuedOffline
        assertEquals("Our server had a problem. Your lesson is saved and will sync automatically.", queued.message)
        assertEquals("u1", store.completions.single().ownerUserId)
    }

    @Test
    fun `at zero hearts the finish is queued to sync after a refill, not failed`() = runBlocking {
        val server = FakeServer { req ->
            if (req.path.endsWith("start-lesson-session")) json("""{"error":"out-of-hearts","refillAt":null}""", HttpStatusCode.Conflict) else json("[]")
        }
        val store = MemorySyncStore()
        val v = vm(server, store)
        playThrough(v)
        awaitTrue("queued") { v.state.value.phase is LessonPhase.QueuedOffline }
        assertEquals("Saved. It will sync when your hearts refill.", (v.state.value.phase as LessonPhase.QueuedOffline).message)
        assertEquals(1, store.completions.size)
    }

    @Test
    fun `no connection at the finish queues it and says so`() = runBlocking {
        val store = MemorySyncStore()
        val v = vm(okServer(), store, connected = false)
        playThrough(v)
        awaitTrue("queued") { v.state.value.phase is LessonPhase.QueuedOffline }
        assertEquals("Saved. It will sync when you're back online.", (v.state.value.phase as LessonPhase.QueuedOffline).message)
    }

    @Test
    fun `a server failure on finish also queues offline`() = runBlocking {
        val server = FakeServer { req ->
            if (req.path.endsWith("start-lesson-session")) json("""{"error":"boom"}""", HttpStatusCode.InternalServerError) else json("[]")
        }
        val store = MemorySyncStore()
        val v = vm(server, store)
        v.begin(); v.startPractice()
        lesson.questions.forEach { q -> v.pick(correctAnswer(q)); v.check(); awaitTrue("checked") { v.state.value.checked }; v.continueOrFinish() }
        awaitTrue("queued offline") { v.state.value.phase is LessonPhase.QueuedOffline }
        assertEquals(1, store.completions.size)
    }

    @Test
    fun `opening the lesson at 0 hearts blocks it with the server's refill time`() = runBlocking {
        val server = FakeServer { req ->
            if (req.path.endsWith("start-lesson-session")) json("""{"error":"out-of-hearts","refillAt":"2026-10-16T20:30:00Z"}""", HttpStatusCode.Conflict) else json("[]")
        }
        val v = vm(server)
        v.onScreenShown()
        awaitTrue("blocked") { v.state.value.outOfHearts != null }
        assertEquals(1_792_182_600_000L, v.state.value.outOfHearts!!.refillAt)
        v.onScreenShown()
        assertEquals("the screen opens one session", 1, server.seen.count { it.path.endsWith("start-lesson-session") })
    }

    @Test
    fun `offline, the cached hearts decide the gate and a due refill opens it`() = runBlocking {
        val blockedStore = MemorySyncStore().apply { updateLastKnownProgress(LessonCompletionProgress(0, 0, 0, null, 0, 1_000.0, 0, "bronze")) }
        val blocked = vm(okServer(), blockedStore, connected = false)
        blocked.onScreenShown()
        awaitTrue("blocked offline") { blocked.state.value.outOfHearts != null }
        assertEquals(1_000L, blocked.state.value.outOfHearts!!.refillAt)

        val dueStore = MemorySyncStore().apply { updateLastKnownProgress(LessonCompletionProgress(0, 0, 0, null, 0, 42.0, 0, "bronze")) }
        val server = okServer()
        val due = vm(server, dueStore, connected = false)
        due.openSession().join()
        assertNull(due.state.value.outOfHearts)
        assertEquals("offline makes no call", 0, server.seen.size)
    }

    @Test
    fun `buying a heart unblocks the lesson and reuses the new session at finish`() = runBlocking {
        var blocked = true
        val server = FakeServer { req ->
            when {
                req.path.endsWith("start-lesson-session") ->
                    if (blocked) json("""{"error":"out-of-hearts","refillAt":null}""", HttpStatusCode.Conflict) else json("""{"token":"fresh"}""")
                req.path.endsWith("buy_heart_with_xp") -> { blocked = false; json("""[{"ok":true,"reason":null,"hearts":1,"xp":10}]""") }
                req.path.endsWith("complete-lesson") -> json("""{"xpGain":50,"newlyUnlocked":[],"heartsBonus":null,"progress":$PROGRESS_JSON}""")
                else -> json("[]")
            }
        }
        val store = MemorySyncStore().apply { updateLastKnownProgress(LessonCompletionProgress(60, 0, 0, null, 0, null, 0, "bronze")) }
        val v = vm(server, store)
        v.onScreenShown()
        awaitTrue("blocked") { v.state.value.outOfHearts != null }
        v.buyHeart()
        awaitTrue("unblocked") { v.state.value.outOfHearts == null && !v.state.value.buyingHeart }
        assertEquals(1, store.lastKnownProgress()!!.hearts)
        v.begin(); v.startPractice()
        lesson.questions.forEach { q -> v.pick(correctAnswer(q)); v.check(); awaitTrue("checked") { v.state.value.checked }; v.continueOrFinish() }
        awaitTrue("finished") { v.state.value.phase is LessonPhase.Finished }
        assertEquals(2, server.seen.count { it.path.endsWith("start-lesson-session") })
        val completeBody = Json.parseToJsonElement(server.seen.single { it.path.endsWith("complete-lesson") }.body).jsonObject
        assertEquals("fresh", completeBody["sessionToken"]!!.jsonPrimitive.content)
    }

    @Test
    fun `a failed buy keeps the lesson blocked and says why`() = runBlocking {
        val server = FakeServer { req ->
            when {
                req.path.endsWith("start-lesson-session") -> json("""{"error":"out-of-hearts","refillAt":null}""", HttpStatusCode.Conflict)
                req.path.endsWith("buy_heart_with_xp") -> json("""[{"ok":false,"reason":"insufficient-xp","hearts":0,"xp":20}]""")
                else -> json("[]")
            }
        }
        val v = vm(server)
        v.onScreenShown()
        awaitTrue("blocked") { v.state.value.outOfHearts != null }
        v.buyHeart()
        awaitTrue("message") { v.state.value.buyMessage != null }
        assertEquals("Not enough XP for a heart. You have 20 XP in this course.", v.state.value.buyMessage)
        assertNotNull(v.state.value.outOfHearts)
    }

    @Test
    fun `an expired held token is replaced once at finish`() = runBlocking {
        var tokens = 0
        val server = FakeServer { req ->
            when {
                req.path.endsWith("start-lesson-session") -> { tokens++; json("""{"token":"t$tokens"}""") }
                req.path.endsWith("complete-lesson") -> {
                    val sent = Json.parseToJsonElement(req.body).jsonObject["sessionToken"]!!.jsonPrimitive.content
                    if (sent == "t1") json("""{"error":"Invalid or expired lesson session"}""", HttpStatusCode.Forbidden)
                    else json("""{"xpGain":50,"newlyUnlocked":[],"heartsBonus":null,"progress":$PROGRESS_JSON}""")
                }
                else -> json("[]")
            }
        }
        val store = MemorySyncStore()
        val v = vm(server, store)
        // Wait for the open to finish (token stored), not just for the server to have answered.
        v.openSession().join()
        assertEquals(1, tokens)
        v.begin(); v.startPractice()
        lesson.questions.forEach { q -> v.pick(correctAnswer(q)); v.check(); awaitTrue("checked") { v.state.value.checked }; v.continueOrFinish() }
        awaitTrue("finished") { v.state.value.phase is LessonPhase.Finished }
        assertEquals(2, tokens)
        val sent = server.seen.filter { it.path.endsWith("complete-lesson") }
            .map { Json.parseToJsonElement(it.body).jsonObject["sessionToken"]!!.jsonPrimitive.content }
        assertEquals("the held token first, then one fresh token", listOf("t1", "t2"), sent)
        assertEquals("nothing queued", 0, store.completions.size)
    }

    @Test
    fun `the HUD is told once a wrong answer's heart is saved, so it shows one fewer`() = runBlocking {
        val store = MemorySyncStore().apply { updateLastKnownProgress(LessonCompletionProgress(0, 0, 0, null, 5, null, 0, "bronze")) }
        val v = vm(okServer(), store)
        v.begin(); v.startPractice()
        assertEquals(0, v.state.value.heartsSpent)
        v.pick(wrongAnswer(lesson.questions[0]))
        v.check().join()
        awaitTrue("heart spent") { v.state.value.heartsSpent == 1 }
        // By the time the HUD hears about it, the store already holds the new count.
        assertEquals(4, store.lastKnownProgress()!!.hearts)
    }

    @Test
    fun `a Pro learner's wrong answer spends no heart, locally or on the server`() = runBlocking {
        val server = okServer()
        val store = MemorySyncStore().apply { updateLastKnownProgress(LessonCompletionProgress(0, 0, 0, null, 4, null, 0, "bronze")) }
        val v = vm(server, store, pro = true)
        v.begin(); v.startPractice()
        v.pick(wrongAnswer(lesson.questions[0]))
        v.check().join()
        awaitTrue("checked") { v.state.value.checked }
        delay(200)
        assertEquals(0, server.seen.count { it.path.endsWith("lose_heart") })
        assertEquals(4, store.lastKnownProgress()!!.hearts)
    }

    @Test
    fun `losing the last heart offline starts the refill timer in the cache`() = runBlocking {
        val store = MemorySyncStore().apply { updateLastKnownProgress(LessonCompletionProgress(0, 0, 0, null, 1, null, 0, "bronze")) }
        val server = okServer()
        val v = vm(server, store)
        v.begin(); v.startPractice()
        v.pick(wrongAnswer(lesson.questions[0])); v.check()
        // The cache is written before lose_heart is sent.
        awaitTrue("lose_heart call") { server.seen.count { it.path.endsWith("lose_heart") } == 1 }
        assertEquals(0, store.lastKnownProgress()!!.hearts)
        assertEquals(42.0 + 30 * 60 * 1000, store.lastKnownProgress()!!.heartsRefillAt)
    }

    @Test
    fun `next lesson crosses unit boundaries within a level and is null at the end`() = runBlocking {
        val v = vm(okServer())
        val unit = testContent.findLesson("u1l1", Course.ENGLISH)!!.first
        assertEquals(unit.lessons[1].id, v.nextLessonId)
        val a1Units = testContent.bundle(Course.ENGLISH).units.filter { it.level == "A1" }
        val lastLesson = a1Units.last().lessons.last()
        val last = LessonViewModel(lastLesson, Course.ENGLISH, testContent, okServer().progressClient, okServer().translation, MemorySyncStore(), { true }, { null }, {}, { 0 }, { true })
        assertNull(last.nextLessonId)
        val endOfFirstUnit = LessonViewModel(a1Units[0].lessons.last(), Course.ENGLISH, testContent, okServer().progressClient, okServer().translation, MemorySyncStore(), { true }, { null }, {}, { 0 }, { true })
        assertEquals(a1Units[1].lessons.first().id, endOfFirstUnit.nextLessonId)
    }

    @Test
    fun `a league change on finish is reported as a promotion`() = runBlocking {
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
        lesson.questions.forEach { q -> v.pick(correctAnswer(q)); v.check(); awaitTrue("checked") { v.state.value.checked }; v.continueOrFinish() }
        awaitTrue("finished") { v.state.value.phase is LessonPhase.Finished }
        val finished = v.state.value.phase as LessonPhase.Finished
        assertTrue(finished.isLeaguePromotion)
        assertEquals("silver", tier)
        assertEquals("perfect", finished.result.heartsBonus)
    }

    private fun unauthorizedServer() = FakeServer { req ->
        when {
            req.path.endsWith("start-lesson-session") -> json("""{"token":"tok"}""")
            req.path.endsWith("complete-lesson") -> json("""{"error":"jwt expired"}""", HttpStatusCode.Unauthorized)
            else -> json("[]")
        }
    }

    @Test
    fun `a 401 at the finish line while still signed in is queued, not reported as signed out`() = runBlocking {
        // The refresh could not reach the server, so the request stayed a 401: the lesson is not lost and not "signed out".
        val store = MemorySyncStore()
        val v = vm(unauthorizedServer(), store, owner = "u1")
        playThrough(v)
        awaitTrue("queued") { v.state.value.phase is LessonPhase.QueuedOffline }
        assertEquals(1, store.completions.size)
        assertEquals("u1", store.completions.single().ownerUserId)
    }

    @Test
    fun `a 401 at the finish line with no session left says signed out and queues nothing`() = runBlocking {
        val store = MemorySyncStore()
        val v = vm(unauthorizedServer(), store, owner = null)
        playThrough(v)
        awaitTrue("failure shown") { v.state.value.phase is LessonPhase.SaveFailed }
        assertTrue((v.state.value.phase as LessonPhase.SaveFailed).message.contains("signed out"))
        assertTrue(store.completions.isEmpty())
    }

    // Sound effects: the view model says which effects a moment asks for; the player (switch, voice, once per key) is
    // core's SoundEffectGate, tested in SoundEffectsTest.

    private fun recordEffects(v: LessonViewModel): Pair<MutableList<SoundEffectRequest>, CoroutineScope> {
        val got = mutableListOf<SoundEffectRequest>()
        val scope = CoroutineScope(Dispatchers.Unconfined + Job())
        scope.launch { v.soundEffects.collect { got += it } }
        return got to scope
    }

    private fun List<SoundEffectRequest>.effects() = map { r -> r.cues.map { it.effect } }

    @Test
    fun `a right answer asks for the right-answer effect, once`() = runBlocking {
        val v = vm(okServer())
        val (got, scope) = recordEffects(v)
        v.begin(); v.startPractice()
        v.pick(correctAnswer(lesson.questions[0])); v.check().join()
        v.check().join()
        assertEquals(listOf(listOf(SoundEffect.RIGHT)), got.effects())
        scope.cancel()
    }

    private suspend fun storeWithHearts(hearts: Int) =
        MemorySyncStore().apply { updateLastKnownProgress(LessonCompletionProgress(0, 0, 0, null, hearts, null, 0, "bronze")) }

    @Test
    fun `a wrong answer asks for the wrong effect, then the heart going once the HUD shows it`() = runBlocking {
        val v = vm(okServer(), storeWithHearts(5))
        val (got, scope) = recordEffects(v)
        v.begin(); v.startPractice()
        v.pick(wrongAnswer(lesson.questions[0])); v.check().join()
        awaitTrue("heart spent") { v.state.value.heartsSpent == 1 }
        awaitTrue("heart sound") { got.size == 2 }
        assertEquals(setOf(listOf(SoundEffect.WRONG), listOf(SoundEffect.HEART_LOST)), got.effects().toSet())
        // It follows the wrong-answer sound rather than playing over it.
        assertEquals(SoundEffect.WRONG.durationMs, got.single { r -> r.cues.any { it.effect == SoundEffect.HEART_LOST } }.cues.single().delayMs)
        scope.cancel()
    }

    @Test
    fun `with no hearts left to lose, the HUD shows no change, so no heart sound`() = runBlocking {
        val v = vm(okServer(), storeWithHearts(0))
        val (got, scope) = recordEffects(v)
        v.begin(); v.startPractice()
        v.pick(wrongAnswer(lesson.questions[0])); v.check().join()
        delay(200)
        assertEquals(0, v.state.value.heartsSpent)
        assertEquals(listOf(listOf(SoundEffect.WRONG)), got.effects())
        scope.cancel()
    }

    @Test
    fun `a Pro learner's wrong answer loses no heart, so no heart sound`() = runBlocking {
        val v = vm(okServer(), storeWithHearts(5), pro = true)
        val (got, scope) = recordEffects(v)
        v.begin(); v.startPractice()
        v.pick(wrongAnswer(lesson.questions[0])); v.check().join()
        delay(200)
        assertEquals(listOf(listOf(SoundEffect.WRONG)), got.effects())
        scope.cancel()
    }

    @Test
    fun `Continue taps, and finishing asks for the jingle and XP once`() = runBlocking {
        val v = vm(okServer())
        val (got, scope) = recordEffects(v)
        playThrough(v)
        awaitTrue("finished") { v.state.value.phase is LessonPhase.Finished }
        val effects = got.effects()
        assertEquals(lesson.questions.size, effects.count { it == listOf(SoundEffect.TAP) })
        assertEquals(listOf(listOf(SoundEffect.LESSON_COMPLETE, SoundEffect.XP)), effects.filter { SoundEffect.LESSON_COMPLETE in it })
        assertEquals(1, got.count { it.key?.startsWith("finish-") == true })
        scope.cancel()
    }
}
