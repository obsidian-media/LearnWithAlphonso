package com.obsidianmedia.learnwithalphonso.core.podcast

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PodcastQuizRunTest {
    private fun q(id: String) = PodcastQuizQuestion(id, "Prompt $id", listOf("a", "b", "c"), answerIndex = 1)
    private val result = PodcastQuizResult(correct = 1, total = 2, xpGain = 10, streak = 3, bestCorrect = 1, bestXp = 10, missedQuestionIds = listOf("q2"))

    private fun answered(run: PodcastQuizRun, choice: Int) = run.select(choice).check().next()
    private fun submitting() = answered(answered(PodcastQuizRun(listOf(q("q1"), q("q2"))), 1), 0)

    @Test
    fun `an empty quiz is its own phase and nothing moves it`() {
        val run = PodcastQuizRun(emptyList())
        assertEquals(PodcastQuizPhase.Empty, run.phase)
        assertEquals(run, run.select(0).check().next())
    }

    @Test
    fun `answering needs a pick, then a check, then next, one step at a time`() {
        var run = PodcastQuizRun(listOf(q("q1"), q("q2")))
        assertEquals(run, run.check(), "check without a pick does nothing")
        assertEquals(run, run.next(), "next before check does nothing")
        run = run.select(2)
        assertEquals(2, run.selected)
        assertEquals(run, run.next(), "next before check does nothing even with a pick")
        run = run.check()
        assertTrue(run.checked)
        assertEquals(2, run.select(0).selected, "a checked answer cannot be changed")
        run = run.next()
        assertEquals(1, run.index)
        assertNull(run.selected)
        assertFalse(run.checked)
        assertEquals(listOf(PodcastQuizAnswer("q1", 2)), run.answers)
    }

    @Test
    fun `an out of range choice is ignored`() {
        val run = PodcastQuizRun(listOf(q("q1")))
        assertNull(run.select(3).selected)
        assertNull(run.select(-1).selected)
    }

    @Test
    fun `the last next submits exactly one answer per question in order`() {
        val run = submitting()
        assertEquals(PodcastQuizPhase.Submitting, run.phase)
        assertEquals(listOf(PodcastQuizAnswer("q1", 1), PodcastQuizAnswer("q2", 0)), run.answers)
    }

    @Test
    fun `a result only lands while submitting and is the server's`() {
        val early = PodcastQuizRun(listOf(q("q1"))).saved(result)
        assertNull(early.result)
        val done = submitting().saved(result)
        assertEquals(PodcastQuizPhase.Done, done.phase)
        assertEquals(result, done.result)
        assertEquals(done, done.failed(PodcastQuizError.SERVER), "a late failure cannot undo a saved result")
    }

    @Test
    fun `a retryable failure can retry with the same answers, a permanent one cannot`() {
        val answers = submitting().answers
        for (e in listOf(PodcastQuizError.RATE_LIMITED, PodcastQuizError.OFFLINE, PodcastQuizError.SERVER)) {
            val failed = submitting().failed(e)
            assertEquals(PodcastQuizPhase.Error(e), failed.phase)
            val again = failed.retry()
            assertEquals(PodcastQuizPhase.Submitting, again.phase)
            assertEquals(answers, again.answers)
        }
        for (e in listOf(PodcastQuizError.NOT_FOUND, PodcastQuizError.INVALID_ANSWERS, PodcastQuizError.UNAUTHORIZED)) {
            val failed = submitting().failed(e)
            assertEquals(failed, failed.retry(), "$e must not offer Try again")
        }
    }

    @Test
    fun `retryability is exactly the transient errors`() {
        assertEquals(
            setOf(PodcastQuizError.RATE_LIMITED, PodcastQuizError.OFFLINE, PodcastQuizError.SERVER),
            PodcastQuizError.entries.filter { it.isRetryable }.toSet(),
        )
    }

    @Test
    fun `copy shows only the server's numbers`() {
        assertEquals("+10 XP", PodcastQuizCopy.xpLine(result))
        assertEquals("No new XP this time. Your best is 2 of 2.", PodcastQuizCopy.xpLine(result.copy(xpGain = 0, bestCorrect = 2, total = 2)))
        assertEquals("5 questions · 10 XP for each correct answer · your best: 3 of 5", PodcastQuizCopy.offerDetail(5, PodcastQuizBest(3, 30)))
        assertEquals("5 questions · 10 XP for each correct answer", PodcastQuizCopy.offerDetail(5, null))
        PodcastQuizError.entries.forEach { assertTrue(PodcastQuizCopy.message(it).isNotBlank()) }
    }
}
