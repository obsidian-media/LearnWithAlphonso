package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Lesson
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.content.Unit
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.ApiHttp
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import kotlin.random.Random

class PronunciationTest {
    private fun unit(vararg lessons: Pair<String, List<String>>): Unit =
        Unit("u1", "A1", "e", "t", "d", lessons.map { (id, answers) ->
            Lesson(id, "t", "s", answers.mapIndexed { i, a -> Question.FillInBlank("${id}q$i", "I see a ___.", listOf(a), a, "x") })
        })

    private fun words(n: Int): List<VocabItem> =
        Pronunciation.learnedPool(listOf(unit("l1" to (0 until n).map { "word$it" })), setOf("l1"), Course.ENGLISH)

    // ---- verdict bands (the same two thresholds as the web) ----

    @Test
    fun `the thresholds are the web ones`() {
        assertEquals(0.85, Pronunciation.HIGH_CONFIDENCE)
        assertEquals(0.6, Pronunciation.LOW_CONFIDENCE)
    }

    private fun judge(said: String, confidence: Double?) = Pronunciation.judge(said, confidence, "dog", Course.ENGLISH)

    @Test
    fun `a match at or above high is great including exactly high`() {
        assertEquals(Pronunciation.Verdict.GREAT, judge("dog", 0.99))
        assertEquals(Pronunciation.Verdict.GREAT, judge("dog", 0.85))
    }

    @Test
    fun `a match between low and high is almost including exactly low`() {
        assertEquals(Pronunciation.Verdict.ALMOST, judge("dog", 0.8499))
        assertEquals(Pronunciation.Verdict.ALMOST, judge("dog", 0.6))
    }

    @Test
    fun `a match below low is try again`() {
        assertEquals(Pronunciation.Verdict.AGAIN, judge("dog", 0.5999))
    }

    @Test
    fun `no match is try again whatever the confidence`() {
        assertEquals(Pronunciation.Verdict.AGAIN, judge("cat", 0.99))
        assertEquals(Pronunciation.Verdict.AGAIN, judge("", 0.99))
        assertEquals(Pronunciation.Verdict.AGAIN, judge("hotdog", 0.99))
    }

    @Test
    fun `a match with no confidence is great`() {
        assertEquals(Pronunciation.Verdict.GREAT, judge("Dog.", null))
    }

    @Test
    fun `matching is forgiving per course`() {
        assertEquals(Pronunciation.Verdict.GREAT, judge("a dog", 0.9))
        assertEquals(Pronunciation.Verdict.GREAT, Pronunciation.judge("el abogado", 0.9, "abogado", Course.SPANISH))
    }

    // ---- learned pool ----

    @Test
    fun `the pool is only words from completed lessons`() {
        val u = unit("l1" to listOf("dog", "cat"), "l2" to listOf("bird"))
        assertEquals(listOf("dog", "cat"), Pronunciation.learnedPool(listOf(u), setOf("l1"), Course.ENGLISH).map { it.term })
    }

    @Test
    fun `finishing another lesson grows the pool on the next call`() {
        val u = unit("l1" to listOf("dog"), "l2" to listOf("bird"))
        assertEquals(listOf("dog"), Pronunciation.learnedPool(listOf(u), setOf("l1"), Course.ENGLISH).map { it.term })
        assertEquals(listOf("dog", "bird"), Pronunciation.learnedPool(listOf(u), setOf("l1", "l2"), Course.ENGLISH).map { it.term })
    }

    @Test
    fun `nothing learned is an empty pool`() {
        assertTrue(Pronunciation.learnedPool(listOf(unit("l1" to listOf("dog"))), emptySet(), Course.ENGLISH).isEmpty())
    }

    @Test
    fun `terms dedupe ignoring case and long phrases are excluded`() {
        val u = unit("l1" to listOf("Dog", "dog", "one two three four five"))
        assertEquals(listOf("Dog"), Pronunciation.learnedPool(listOf(u), setOf("l1"), Course.ENGLISH).map { it.term })
        assertTrue(Pronunciation.usableTarget("one two three four", Course.ENGLISH))
        assertFalse(Pronunciation.usableTarget("one two three four five", Course.ENGLISH))
        assertFalse(Pronunciation.usableTarget("  ", Course.ENGLISH))
    }

    @Test
    fun `a draw is eight distinct words of a larger pool and the whole of a smaller one`() {
        val drawn = Pronunciation.draw(words(20), random = Random(1))
        assertEquals(8, drawn.size)
        assertEquals(8, drawn.map { it.term }.toSet().size)
        assertEquals(5, Pronunciation.draw(words(5)).size)
    }

    @Test
    fun `stars are by share and never below one`() {
        assertEquals(3, Pronunciation.stars(8, 8))
        assertEquals(3, Pronunciation.stars(6, 8))
        assertEquals(2, Pronunciation.stars(4, 8))
        assertEquals(1, Pronunciation.stars(0, 8))
        assertEquals(1, Pronunciation.stars(0, 0))
    }

    // ---- session flow (a miss teaches, never punishes) ----

    @Test
    fun `a first attempt great earns the star and moves to the result`() {
        val (s, o) = PronunciationSession(words(8)).submit("word0", 0.95, Course.ENGLISH)
        assertEquals(PronunciationOutcome.Great, o)
        assertEquals(PronunciationPhase.RESULT, s.phase)
        assertEquals(1, s.greatFirst)
        val n = s.next()
        assertEquals(1, n.index)
        assertEquals(PronunciationPhase.ASK, n.phase)
    }

    @Test
    fun `an almost allows one retry and earns no star`() {
        val (s, o) = PronunciationSession(words(8)).submit("word0", 0.7, Course.ENGLISH)
        assertEquals(PronunciationOutcome.Retry(Pronunciation.Verdict.ALMOST), o)
        assertEquals(PronunciationPhase.RETRY, s.phase)
        assertEquals(0, s.greatFirst)
    }

    @Test
    fun `a retry that is great finishes the word but earns no star`() {
        val (miss, _) = PronunciationSession(words(8)).submit("banana", 0.99, Course.ENGLISH)
        assertEquals(PronunciationPhase.RETRY, miss.phase)
        val (s, o) = miss.submit("word0", 0.99, Course.ENGLISH)
        assertEquals(PronunciationOutcome.Finished(Pronunciation.Verdict.GREAT), o)
        assertEquals(PronunciationPhase.RESULT, s.phase)
        assertEquals(Pronunciation.Verdict.GREAT, s.verdict)
        assertEquals(0, s.greatFirst)
    }

    @Test
    fun `a failed retry still moves on without another try`() {
        val (miss, _) = PronunciationSession(words(8)).submit("banana", 0.99, Course.ENGLISH)
        val (s, o) = miss.submit("apple", 0.99, Course.ENGLISH)
        assertEquals(PronunciationOutcome.Finished(Pronunciation.Verdict.AGAIN), o)
        assertEquals(PronunciationPhase.RESULT, s.phase)
        // The word is done: a further transcript changes nothing.
        val (still, o2) = s.submit("word0", 0.99, Course.ENGLISH)
        assertEquals(PronunciationOutcome.Unheard, o2)
        assertEquals(0, still.greatFirst)
        val n = still.next()
        assertEquals(1, n.index)
        assertNull(n.verdict)
    }

    @Test
    fun `silence is not a miss`() {
        val (s, o) = PronunciationSession(words(8)).submit("  ", null, Course.ENGLISH)
        assertEquals(PronunciationOutcome.Unheard, o)
        assertEquals(PronunciationPhase.ASK, s.phase)
    }

    @Test
    fun `a word can be skipped from any phase`() {
        val skipped = PronunciationSession(words(8)).next()
        assertEquals(1, skipped.index)
        val (retry, _) = skipped.submit("banana", 0.9, Course.ENGLISH)
        assertEquals(PronunciationPhase.RETRY, retry.phase)
        val n = retry.next()
        assertEquals(2, n.index)
        assertEquals(PronunciationPhase.ASK, n.phase)
        assertEquals(0, n.greatFirst)
    }

    @Test
    fun `eight rounds then done with the stars`() {
        var s = PronunciationSession(words(8))
        for (i in 0 until 8) {
            assertEquals(i, s.index)
            assertEquals(PronunciationPhase.ASK, s.phase)
            if (i < 6) s = s.submit("word$i", 0.95, Course.ENGLISH).first
            if (i == 7) assertEquals("Finish", s.skipLabel)
            s = s.next()
        }
        assertEquals(PronunciationPhase.DONE, s.phase)
        assertEquals(6, s.greatFirst)
        assertEquals(3, s.stars)
    }

    @Test
    fun `a finished session ignores further input`() {
        val done = PronunciationSession(words(1)).submit("word0", 0.95, Course.ENGLISH).first.next()
        assertEquals(PronunciationPhase.DONE, done.phase)
        val (again, o) = done.submit("word0", 0.95, Course.ENGLISH)
        assertEquals(PronunciationOutcome.Unheard, o)
        assertEquals(1, again.greatFirst)
    }

    @Test
    fun `no words is done at once`() {
        assertEquals(PronunciationPhase.DONE, PronunciationSession(emptyList()).phase)
    }

    // ---- same endpoints, and the confidence is passed through ----

    @Test
    fun `speech goes to the existing stt route returning the confidence and model audio to tts`() = runTest {
        val paths = ArrayList<String>()
        val bodies = ArrayList<String>()
        val engine = MockEngine { req ->
            paths.add(req.url.encodedPath)
            bodies.add(req.body.toByteArray().decodeToString(throwOnInvalidSequence = false))
            if (req.url.encodedPath.endsWith("stt")) respond("""{"text":"perro","confidence":0.72}""".toByteArray(), HttpStatusCode.OK)
            else respond(byteArrayOf(1, 2), HttpStatusCode.OK)
        }
        val speech = PronunciationSpeech(AiConversationClient(ApiHttp("https://learn.alphonsoecosystem.app", { "tok" }, engine)))
        val heard = speech.transcribe(ByteArray(10), Course.SPANISH)
        speech.modelAudio("perro", null, Course.SPANISH)
        assertEquals("perro", heard.text)
        assertEquals(0.72, heard.confidence)
        assertEquals(listOf("/api/stt", "/api/tts"), paths)
        assertTrue(bodies[0].contains("es"))
        assertEquals("""{"text":"perro","course":"es"}""", bodies[1])
    }
}
