package com.obsidianmedia.learnwithalphonso.ui.placement

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.PlacementQuestion
import com.obsidianmedia.learnwithalphonso.core.logic.isPlacementAnswerCorrect
import com.obsidianmedia.learnwithalphonso.testContent
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import kotlin.random.Random

@OptIn(ExperimentalCoroutinesApi::class)
class PlacementViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private fun server() = FakeServer { req -> if (req.path.endsWith("save_placement_result")) json("") else json("""{"correct":false,"reason":null}""") }

    private fun vm(s: FakeServer, canPlayAudio: Boolean = false) =
        PlacementViewModel(testContent, s.progressClient, s.translation, Course.ENGLISH, canPlayAudio = canPlayAudio, isConnected = { false }, random = Random(7))

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
    fun `starts with three A1 questions from the real pool`() = runTest {
        val v = vm(server())
        val s = v.state.value
        assertEquals(3, s.total)
        assertTrue(s.shown.all { it.level == "A1" })
        assertTrue(s.shown.none { it is PlacementQuestion.Listening })
    }

    @Test
    fun `a perfect A1 band skips A2 with synthetic credit and lands on B1`() = runTest {
        val v = vm(server())
        repeat(3) {
            val q = v.state.value.currentQuestion!!
            v.pick(rightAnswer(q)); v.submit(); advanceUntilIdle()
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
    fun `zero correct on a band stops the exam, saves A1 and reports the score`() = runTest {
        val s = server()
        val v = vm(s)
        repeat(3) {
            val q = v.state.value.currentQuestion!!
            v.pick(wrongAnswer(q)); v.submit(); advanceUntilIdle()
        }
        assertTrue(v.state.value.done)
        assertEquals("A1", v.state.value.level)
        val save = s.seen.first { it.path.endsWith("save_placement_result") }
        assertEquals("""{"_language":"en","_level":"A1","_score":0}""", save.body)
    }

    @Test
    fun `two of three passes a band and advances by one`() = runTest {
        val v = vm(server())
        val qs = v.state.value.shown
        v.pick(rightAnswer(qs[0])); v.submit(); advanceUntilIdle()
        v.pick(rightAnswer(qs[1])); v.submit(); advanceUntilIdle()
        v.pick(wrongAnswer(qs[2])); v.submit(); advanceUntilIdle()
        val s = v.state.value
        assertTrue(s.skippedLevels.isEmpty())
        assertEquals("A2", s.shown.last().level)
        assertEquals(1, s.bandIdx)
        assertEquals("A2", s.level)
    }

    @Test
    fun `wrong answers are graded through the shared placement grader`() = runTest {
        val v = vm(server())
        val q = v.state.value.currentQuestion!!
        assertTrue(isPlacementAnswerCorrect(q, rightAnswer(q)))
        assertTrue(!isPlacementAnswerCorrect(q, wrongAnswer(q)))
    }
}
