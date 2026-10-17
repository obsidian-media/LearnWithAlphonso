package com.obsidianmedia.learnwithalphonso.ui.lesson

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.MemorySyncStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.PlacementQuestion
import com.obsidianmedia.learnwithalphonso.testContent
import com.obsidianmedia.learnwithalphonso.ui.placement.PlacementViewModel
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import kotlin.random.Random

/** A written answer reaches the AI grader only when the account allowed it; without consent the lesson goes on, graded locally. */
class AiConsentGradingTest {
    @get:Rule val main = MainDispatcherRule()

    private val lesson = testContent.findLesson("a1p25l1", Course.ENGLISH)!!.second

    private fun server() = FakeServer { req ->
        when {
            req.path.endsWith("api/grade-translation") -> json("""{"correct":true,"reason":null}""")
            else -> json("[]")
        }
    }

    private fun lessonVm(s: FakeServer, consent: Boolean) = LessonViewModel(
        lesson, Course.ENGLISH, testContent, s.progressClient, s.translation, MemorySyncStore(),
        isConnected = { true }, lastKnownTier = { null }, rememberTier = {}, now = { 42L }, hasAiConsent = { consent },
    )

    @Test
    fun `without consent a wrong written answer is judged locally and nothing is sent`() = runBlocking {
        val s = server()
        val v = lessonVm(s, consent = false)
        v.begin(); v.startPractice()
        v.pick("this is not an acceptable translation at all")
        v.check().join()
        assertFalse(s.paths().any { it.endsWith("api/grade-translation") })
        assertEquals(false, v.state.value.translationVerdict?.correct)
        assertTrue(v.state.value.checked)
    }

    @Test
    fun `with consent the written answer is sent for a second opinion`() = runBlocking {
        val s = server()
        val v = lessonVm(s, consent = true)
        v.begin(); v.startPractice()
        v.pick("this is not an acceptable translation at all")
        v.check().join()
        assertEquals(1, s.paths().count { it.endsWith("api/grade-translation") })
        assertEquals(true, v.state.value.translationVerdict?.correct)
    }

    @Test
    fun `a locally correct answer is never sent, consent or not`() = runBlocking {
        val s = server()
        val v = lessonVm(s, consent = true)
        v.begin(); v.startPractice()
        v.pick("Good morning.")
        v.check().join()
        assertFalse(s.paths().any { it.endsWith("api/grade-translation") })
        assertEquals(true, v.state.value.translationVerdict?.correct)
    }

    private fun placementVm(s: FakeServer, consent: Boolean) =
        PlacementViewModel(testContent, s.progressClient, s.translation, Course.ENGLISH, canPlayAudio = false, isConnected = { true }, random = Random(7), hasAiConsent = { consent })

    private suspend fun answerUntilTranslate(v: PlacementViewModel): PlacementQuestion.Translate? {
        repeat(40) {
            val q = v.state.value.currentQuestion ?: return null
            if (q is PlacementQuestion.Translate) return q
            v.pick(when (q) {
                is PlacementQuestion.MultipleChoice -> q.choices[q.answer]
                is PlacementQuestion.Listening -> q.answer
                is PlacementQuestion.Translate -> q.acceptableAnswers.first()
            })
            v.submit().join()
        }
        return null
    }

    @Test
    fun `placement asks the server grader only with consent`() = runBlocking {
        val denied = server()
        val v1 = placementVm(denied, consent = false)
        assertNotNull("the walk reaches a translate question", answerUntilTranslate(v1))
        v1.pick("not a translation"); v1.submit().join()
        assertFalse(denied.paths().any { it.endsWith("api/grade-translation") })

        val allowed = server()
        val v2 = placementVm(allowed, consent = true)
        assertNotNull(answerUntilTranslate(v2))
        v2.pick("not a translation"); v2.submit().join()
        assertEquals(1, allowed.paths().count { it.endsWith("api/grade-translation") })
    }
}
