package com.obsidianmedia.learnwithalphonso.ui.placement

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.PlacementQuestion
import com.obsidianmedia.learnwithalphonso.core.logic.BandMarkerState
import com.obsidianmedia.learnwithalphonso.core.logic.isPlacementAnswerCorrect
import com.obsidianmedia.learnwithalphonso.testContent
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import kotlin.random.Random

class PlacementViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private fun server() = FakeServer { req -> if (req.path.endsWith("save_placement_result")) json("") else json("""{"correct":false,"reason":null}""") }

    private fun vm(s: FakeServer, canPlayAudio: Boolean = false, course: Course = Course.ENGLISH) =
        PlacementViewModel(testContent, s.progressClient, s.translation, course, canPlayAudio = canPlayAudio, isConnected = { false }, random = Random(7), hasAiConsent = { true })

    private fun rightAnswer(q: PlacementQuestion): String = when (q) {
        is PlacementQuestion.MultipleChoice -> q.choices[q.answer]
        is PlacementQuestion.Listening -> q.answer
        is PlacementQuestion.Translate -> q.acceptableAnswers.first()
    }

    private fun wrongAnswer(q: PlacementQuestion): String = when (q) {
        is PlacementQuestion.MultipleChoice -> q.choices.first { it != q.choices[q.answer] }
        else -> "wrong wrong wrong"
    }

    @Test
    fun `starts with three A1 questions from the real pool`() = runBlocking {
        val v = vm(server())
        val s = v.state.value
        assertEquals(3, s.total)
        assertTrue(s.shown.all { it.level == "A1" })
        assertTrue(s.shown.none { it is PlacementQuestion.Listening })
    }

    @Test
    fun `a perfect A1 band skips A2 with synthetic credit and lands on B1`() = runBlocking {
        val v = vm(server())
        repeat(3) {
            val q = v.state.value.currentQuestion!!
            v.pick(rightAnswer(q)); v.submit(); awaitTrue("advanced") { v.state.value.picked == null }
        }
        val s = v.state.value
        assertEquals(listOf("A2"), s.skippedLevels)
        assertEquals(2, s.correctByLevel["A2"])
        assertEquals(3, s.correctByLevel["A1"])
        assertEquals("B1", s.shown.last().level)
        assertEquals(6, s.total)
        assertEquals(3, s.step)
    }

    @Test
    fun `zero correct on a band stops the exam, saves A1 and reports the score`() = runBlocking {
        val s = server()
        val v = vm(s)
        repeat(3) {
            val q = v.state.value.currentQuestion!!
            v.pick(wrongAnswer(q)); v.submit(); awaitTrue("advanced") { v.state.value.picked == null }
        }
        assertTrue(v.state.value.done)
        assertEquals("A1", v.state.value.level)
        awaitTrue("saved") { s.seen.any { it.path.endsWith("save_placement_result") } }
        val save = s.seen.first { it.path.endsWith("save_placement_result") }
        assertEquals("""{"_language":"en","_level":"A1","_score":0}""", save.body)
    }

    @Test
    fun `two of three passes a band and advances by one`() = runBlocking {
        val v = vm(server())
        val qs = v.state.value.shown
        v.pick(rightAnswer(qs[0])); v.submit(); awaitTrue("q1") { v.state.value.step == 1 }
        v.pick(rightAnswer(qs[1])); v.submit(); awaitTrue("q2") { v.state.value.step == 2 }
        v.pick(wrongAnswer(qs[2])); v.submit(); awaitTrue("q3") { v.state.value.step == 3 }
        val s = v.state.value
        assertTrue(s.skippedLevels.isEmpty())
        assertEquals("A2", s.shown.last().level)
        assertEquals(1, s.bandIdx)
        assertEquals("A2", s.level)
    }

    @Test
    fun `wrong answers are graded through the shared placement grader`() = runBlocking {
        val v = vm(server())
        val q = v.state.value.currentQuestion!!
        assertTrue(isPlacementAnswerCorrect(q, rightAnswer(q)))
        assertTrue(!isPlacementAnswerCorrect(q, wrongAnswer(q)))
    }

    /** Answers the next questions in order, one verdict each: true is right, false is wrong. */
    private fun answers(v: PlacementViewModel, vararg verdicts: Boolean) {
        for (right in verdicts) {
            val before = v.state.value.answers.size
            val q = v.state.value.currentQuestion!!
            v.pick(if (right) rightAnswer(q) else wrongAnswer(q))
            v.submit()
            awaitTrue("answer ${before + 1} recorded") { v.state.value.answers.size == before + 1 }
        }
    }

    private val right = true
    private val wrong = false

    private fun savedBody(s: FakeServer): String {
        awaitTrue("saved") { s.seen.any { it.path.endsWith("save_placement_result") } }
        return s.seen.first { it.path.endsWith("save_placement_result") }.body
    }

    // The defect these pin, found in a QA run on the iOS build and present on every platform: ace A1 and the exam
    // skips A2 on credit it gives itself, then lands on B1. Fail B1 outright and it used to stop there and place the
    // learner AT B1 -- on the strength of an A2 nobody ever asked them. A skip is only a bet that the next band will
    // be passed; when it is not, the exam goes back and asks the skipped band and places on real answers.

    @Test
    fun `a failed B1 after the A2 skip goes back and asks A2, and places at A2 when A2 is failed too`() = runBlocking {
        val s = server()
        val v = vm(s)
        answers(v, right, right, right) // A1 perfect: A2 skipped
        assertEquals("B1", v.state.value.currentQuestion!!.level)
        answers(v, wrong, wrong, wrong) // B1 failed outright

        assertFalse("the exam must not end on the credit it gave A2", v.state.value.done)
        assertEquals("A2", v.state.value.currentQuestion!!.level)
        assertEquals(9, v.state.value.total)
        assertFalse("the first question of the sent-back band is not the last one", v.state.value.isFinalQuestion)
        answers(v, wrong, wrong)
        // The sent-back band is the last one asked, so its final question already reads "See my level".
        assertTrue("the last question of the sent-back band must read See my level", v.state.value.isFinalQuestion)
        answers(v, wrong)

        val end = v.state.value
        assertTrue(end.done)
        assertEquals("A2", end.level)
        assertEquals(3, end.correctTotal)
        // Nothing was fast-tracked: the one band that was skipped has been asked after all.
        assertEquals(emptyList<String>(), end.skippedLevels)
        assertEquals("""{"_language":"en","_level":"A2","_score":3}""", savedBody(s))
    }

    @Test
    fun `places at B1 once the band it went back to is really passed`() = runBlocking {
        val s = server()
        val v = vm(s)
        answers(v, right, right, right, wrong, wrong, wrong) // A1 perfect, B1 failed outright
        assertFalse("a failed B1 must send the exam back to A2, not end it", v.state.value.done)
        assertEquals("A2", v.state.value.currentQuestion!!.level)
        answers(v, right, right, wrong) // A2 really passed, 2 of 3

        val end = v.state.value
        assertTrue(end.done)
        assertEquals("B1", end.level)
        assertEquals(5, end.correctTotal)
        assertEquals(emptyList<String>(), end.skippedLevels)
        assertEquals("""{"_language":"en","_level":"B1","_score":5}""", savedBody(s))
    }

    @Test
    fun `1 of 3 on B1 after a skip is a fail too and goes back to A2 instead of on to B2`() = runBlocking {
        val v = vm(server())
        answers(v, right, right, right)
        answers(v, right, wrong, wrong) // B1: 1 of 3, under the 2-of-3 pass mark

        assertFalse("1 of 3 on B1 is a fail: back to A2, not on to B2 and not the end", v.state.value.done)
        assertEquals("A2", v.state.value.currentQuestion!!.level)
        assertEquals(9, v.state.value.total)
        answers(v, wrong, wrong, wrong)

        val end = v.state.value
        assertTrue(end.done)
        assertEquals("A2", end.level)
        assertEquals(4, end.correctTotal)
        assertEquals(emptyList<String>(), end.skippedLevels)
    }

    @Test
    fun `2 of 3 on B1 after a skip keeps the fast-track and carries on to B2`() = runBlocking {
        val v = vm(server())
        answers(v, right, right, right)
        answers(v, right, right, wrong) // B1 passed, not perfect

        assertFalse("2 of 3 on B1 is a pass: carry on to B2", v.state.value.done)
        assertEquals("B2", v.state.value.currentQuestion!!.level)
        assertEquals(listOf("A2"), v.state.value.skippedLevels)
        answers(v, wrong, wrong, wrong)

        val end = v.state.value
        assertTrue(end.done)
        assertEquals("B2", end.level) // A1 and B1 passed, A2 stands on B1, B2 failed
        assertEquals(5, end.correctTotal)
        assertEquals(listOf("A2"), end.skippedLevels)
    }

    @Test
    fun `3 of 3 on B1 after a skip skips B2 too and both credits stand once C1 is passed`() = runBlocking {
        val v = vm(server())
        answers(v, right, right, right, right, right, right)

        assertFalse("two perfect bands skip A2 and B2: C1 is next", v.state.value.done)
        assertEquals("C1", v.state.value.currentQuestion!!.level)
        assertEquals(listOf("A2", "B2"), v.state.value.skippedLevels)
        answers(v, right, right, right)

        val end = v.state.value
        assertTrue(end.done)
        assertEquals("C1", end.level)
        assertEquals(9, end.correctTotal)
        assertEquals(listOf("A2", "B2"), end.skippedLevels)
    }

    @Test
    fun `a failed C1 after a double skip goes back to B2 and keeps the A2 credit that B1 backs`() = runBlocking {
        val v = vm(server())
        answers(v, right, right, right, right, right, right, wrong, wrong, wrong) // C1 failed outright

        assertFalse("a failed C1 must send the exam back to B2, not end it", v.state.value.done)
        assertEquals("B2", v.state.value.currentQuestion!!.level)
        answers(v, wrong, wrong, wrong)

        val end = v.state.value
        assertTrue(end.done)
        assertEquals("B2", end.level)
        assertEquals(6, end.correctTotal)
        assertEquals(12, end.total)
        assertEquals(listOf("A2"), end.skippedLevels)
    }

    @Test
    fun `the same rule higher up, A2 perfect skips B1 and a failed B2 sends the exam back to B1`() = runBlocking {
        val v = vm(server())
        answers(v, right, right, wrong) // A1: 2 of 3 is a pass but not perfect, so A2 is asked
        assertEquals("A2", v.state.value.currentQuestion!!.level)
        answers(v, right, right, right) // A2 perfect: B1 skipped
        assertEquals("B2", v.state.value.currentQuestion!!.level)
        answers(v, wrong, wrong, wrong) // B2 failed outright

        assertFalse("a failed B2 must send the exam back to B1, not end it", v.state.value.done)
        assertEquals("B1", v.state.value.currentQuestion!!.level)
        answers(v, wrong, wrong, wrong)

        val end = v.state.value
        assertTrue(end.done)
        assertEquals("B1", end.level)
        assertEquals(5, end.correctTotal)
        assertEquals(12, end.total)
        assertEquals(emptyList<String>(), end.skippedLevels)
    }

    private fun markerStates(v: PlacementViewModel) = v.state.value.markers.associate { it.level to it.state }

    @Test
    fun `the counter says up to 15 from the first question to the last`() = runBlocking {
        val v = vm(server())
        val seen = mutableListOf<String>()
        for (verdict in listOf(right, right, right, wrong, wrong, wrong, wrong, wrong, wrong)) {
            seen += v.state.value.progressLabel
            answers(v, verdict)
        }
        assertEquals((1..9).map { "Question $it · up to 15" }, seen)
        // finishing early reads as a result
        assertTrue(v.state.value.done)
        assertEquals("Placed after 9 questions", v.state.value.finishedLabel)
    }

    @Test
    fun `no finish note when every question was asked`() = runBlocking {
        val v = vm(server())
        // 2 of 3 in every band: nothing is skipped, all 15 are asked
        repeat(5) { answers(v, right, right, wrong) }
        assertTrue(v.state.value.done)
        assertEquals(15, v.state.value.total)
        assertEquals(null, v.state.value.finishedLabel)
    }

    @Test
    fun `markers tell a skipped band from a passed one and take it back when the credit is withdrawn`() = runBlocking {
        val v = vm(server())
        assertEquals(BandMarkerState.CURRENT, markerStates(v)["A1"])
        answers(v, right, right, right)
        assertEquals(
            listOf(BandMarkerState.PASSED, BandMarkerState.SKIPPED, BandMarkerState.CURRENT, BandMarkerState.UPCOMING, BandMarkerState.UPCOMING),
            v.state.value.markers.map { it.state },
        )
        answers(v, wrong, wrong, wrong)
        assertEquals(BandMarkerState.CURRENT, markerStates(v)["A2"])
        assertEquals(BandMarkerState.MISSED, markerStates(v)["B1"])
    }

    @Test
    fun `skip then fail goes back to A2 on the French and Spanish courses too`() = runBlocking {
        for (course in listOf(Course.FRENCH, Course.SPANISH)) {
            val v = vm(server(), course = course)
            assertEquals("Question 1 · up to 15", v.state.value.progressLabel)
            answers(v, right, right, right)
            answers(v, wrong, wrong, wrong)
            assertFalse("${course.name}: must go back, not end", v.state.value.done)
            assertEquals(course.name, "A2", v.state.value.currentQuestion!!.level)
            answers(v, wrong, wrong, wrong)
            assertTrue(v.state.value.done)
            assertEquals(course.name, "A2", v.state.value.level)
            assertEquals(course.name, emptyList<String>(), v.state.value.skippedLevels)
        }
    }
}
