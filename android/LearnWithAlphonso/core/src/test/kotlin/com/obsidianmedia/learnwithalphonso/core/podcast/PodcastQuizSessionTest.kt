package com.obsidianmedia.learnwithalphonso.core.podcast

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PodcastQuizSessionTest {
    private fun q(id: String) = PodcastQuizQuestion(id, "P$id", listOf("a", "b"), 0)
    private val offer = PodcastQuizOffer(listOf(q("q1"), q("q2")), PodcastQuizBest(1, 10))
    private val server = PodcastQuizResult(2, 2, 10, 5, 2, 20, emptyList())

    private fun finish(s: PodcastQuizSession) {
        repeat(2) { s.select(1); s.check(); s.next() }
    }

    @Test
    fun `finishing sends the answers once with the finish time, and shows the server result`() = runTest {
        val sent = ArrayList<Pair<List<PodcastQuizAnswer>, Long>>()
        val saved = ArrayList<PodcastQuizResult>()
        val scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler))
        val s = PodcastQuizSession(offer, scope, { a, t -> sent.add(a to t); server }, { 42L }, { saved.add(it) })
        finish(s)
        assertEquals(1, sent.size)
        assertEquals(listOf(PodcastQuizAnswer("q1", 1), PodcastQuizAnswer("q2", 1)), sent[0].first)
        assertEquals(42L, sent[0].second)
        assertEquals(PodcastQuizPhase.Done, s.run.value.phase)
        assertEquals(server, s.run.value.result)
        assertEquals(listOf(server), saved)
    }

    @Test
    fun `a failure shows an error, Try again resends the same answers once`() = runTest {
        var calls = 0
        val scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler))
        val seenAnswers = ArrayList<List<PodcastQuizAnswer>>()
        val s = PodcastQuizSession(offer, scope, { a, _ ->
            seenAnswers.add(a)
            if (++calls == 1) throw PodcastQuizException(PodcastQuizError.RATE_LIMITED) else server
        }, { 0L })
        finish(s)
        assertEquals(PodcastQuizPhase.Error(PodcastQuizError.RATE_LIMITED), s.run.value.phase)
        s.retry()
        s.retry()
        assertEquals(2, calls, "retry after success must not send again")
        assertEquals(seenAnswers[0], seenAnswers[1])
        assertEquals(PodcastQuizPhase.Done, s.run.value.phase)
    }

    @Test
    fun `a permanent failure cannot be retried`() = runTest {
        var calls = 0
        val scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler))
        val s = PodcastQuizSession(offer, scope, { _, _ -> calls++; throw PodcastQuizException(PodcastQuizError.NOT_FOUND) })
        finish(s)
        s.retry()
        assertEquals(1, calls)
        assertEquals(PodcastQuizPhase.Error(PodcastQuizError.NOT_FOUND), s.run.value.phase)
    }

    @Test
    fun `an unexpected exception becomes a server error`() = runTest {
        val scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler))
        val s = PodcastQuizSession(offer, scope, { _, _ -> throw IllegalStateException("boom") })
        finish(s)
        assertEquals(PodcastQuizPhase.Error(PodcastQuizError.SERVER), s.run.value.phase)
    }

    @Test
    fun `the submit lives on the injected scope, not on whoever observes the run`() = runTest {
        val gate = CompletableDeferred<PodcastQuizResult>()
        val scope = CoroutineScope(UnconfinedTestDispatcher(testScheduler))
        val s = PodcastQuizSession(offer, scope, { _, _ -> gate.await() })
        finish(s)
        // The sheet is gone (nobody collects s.run); the request is still in flight and still lands.
        assertEquals(PodcastQuizPhase.Submitting, s.run.value.phase)
        gate.complete(server)
        assertTrue(s.run.value.phase == PodcastQuizPhase.Done)
    }
}
