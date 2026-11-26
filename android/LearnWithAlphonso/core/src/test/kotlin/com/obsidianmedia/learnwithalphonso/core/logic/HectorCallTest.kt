package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.net.AiConversationError
import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage
import com.obsidianmedia.learnwithalphonso.core.net.TutorConversationError
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Test
import java.io.IOException

class HectorCallTest {
    private fun m(role: String, text: String) = ChatMessage(role, text)

    @Test
    fun `history excludes the current learner turn`() {
        val turns = listOf(m("assistant", "Hi"), m("user", "one"), m("assistant", "reply"), m("user", "two"))
        assertEquals(listOf("Hi", "one", "reply"), HectorCall.priorTurns(turns).map { it.content })
    }

    @Test
    fun `history of a first turn is empty and a trailing reply is kept`() {
        assertEquals(emptyList<ChatMessage>(), HectorCall.priorTurns(listOf(m("user", "hello"))))
        assertEquals(2, HectorCall.priorTurns(listOf(m("user", "a"), m("assistant", "b"))).size)
    }

    @Test
    fun `analysis runs once per stretch, never for a short call, never after a recap`() {
        assertTrue(HectorCall.shouldAnalyse(4, 0, false))
        assertFalse(HectorCall.shouldAnalyse(4, 4, false))
        assertTrue(HectorCall.shouldAnalyse(6, 4, false))
        assertFalse(HectorCall.shouldAnalyse(3, 0, false))
        assertFalse(HectorCall.shouldAnalyse(8, 0, true))
    }

    private fun learnerTurns(n: Int) = listOf(m("assistant", "Hi")) + (0 until n).flatMap { listOf(m("user", "u$it"), m("assistant", "a$it")) }

    /** The thread as the screen builds it: a greeting, then [n] exchanges. */
    private fun more(base: List<ChatMessage>, n: Int) = base + (0 until n).flatMap { listOf(m("user", "u${base.size + it}"), m("assistant", "a${base.size + it}")) }

    @Test
    fun `call again mints a new call id and session and clears the analysis`() {
        val tracker = HectorCallTracker(HectorCall.Ids("c1", "s1"))
        assertTrue(tracker.claimAnalysis(learnerTurns(2)))
        assertFalse(tracker.claimAnalysis(learnerTurns(2)))
        val next = tracker.startNewCall()
        assertNotEquals("c1", next.callId)
        assertNotEquals("s1", next.sessionId)
        assertEquals(next, tracker.ids)
        assertTrue(tracker.claimAnalysis(learnerTurns(2)), "a new call is analysed afresh")
    }

    @Test
    fun `call end needs three learner turns and is claimed once per call id`() {
        val tracker = HectorCallTracker()
        assertNull(tracker.claimCallEnd(learnerTurns(2)))
        val first = tracker.claimCallEnd(learnerTurns(3))
        assertEquals(7, first!!.messages.size)
        assertNull(tracker.claimCallEnd(learnerTurns(3)), "hang-up then leaving the screen")
        tracker.startNewCall()
        assertNotNull(tracker.claimCallEnd(learnerTurns(3)), "call again is a new call with its own call-end")
    }

    @Test
    fun `talking again after a call end was sent starts a new segment with a fresh call id and only the new turns`() {
        val tracker = HectorCallTracker(HectorCall.Ids("c1", "s1"))
        val thread = learnerTurns(3)
        val sent = tracker.claimCallEnd(thread)!!
        assertEquals("c1", sent.callId)
        // The learner is back and speaks (7 turns so far).
        tracker.onLearnerTurn(thread.size)
        assertNotEquals("c1", tracker.ids.callId)
        assertEquals("s1", tracker.ids.sessionId, "the tutor session carries on")
        val grown = more(thread, 3)
        val second = tracker.claimCallEnd(grown)!!
        assertEquals(tracker.ids.callId, second.callId)
        assertEquals(6, second.messages.size, "only the turns since the leave")
        assertEquals("u7", second.messages.first().content)
    }

    @Test
    fun `talking again without a call end having been sent keeps the same call id`() {
        val tracker = HectorCallTracker(HectorCall.Ids("c1", "s1"))
        tracker.onLearnerTurn(1)
        assertEquals("c1", tracker.ids.callId)
        assertNull(tracker.claimCallEnd(learnerTurns(2)))
        tracker.onLearnerTurn(5)
        assertEquals("c1", tracker.ids.callId, "a refused short claim is not a send")
    }

    @Test
    fun `no separate analysis once call end succeeded, but an error or an unsaved call still falls back`() {
        val ok = HectorCallTracker()
        ok.claimCallEnd(learnerTurns(3))
        ok.callEndSucceeded(ok.ids.callId)
        assertFalse(ok.claimAnalysis(learnerTurns(3)), "kept: the weakness events were recorded")

        val failed = HectorCallTracker()
        failed.claimCallEnd(learnerTurns(3))
        // An error, a 429 or saved:false leaves callEndSucceeded uncalled.
        assertTrue(failed.claimAnalysis(learnerTurns(3)), "the fallback runs")
        assertFalse(failed.claimAnalysis(learnerTurns(3)), "and only once")

        val short = HectorCallTracker()
        assertNull(short.claimCallEnd(learnerTurns(2)))
        assertTrue(short.claimAnalysis(learnerTurns(2)))
    }

    @Test
    fun `a stale success never covers a newer segment`() {
        val tracker = HectorCallTracker(HectorCall.Ids("c1", "s1"))
        val thread = learnerTurns(3)
        tracker.claimCallEnd(thread)
        tracker.onLearnerTurn(thread.size)
        tracker.callEndSucceeded("c1")
        assertTrue(tracker.claimAnalysis(more(thread, 2)), "the new segment has its own analysis")
    }

    @Test
    fun `only saved and already saved count as kept`() {
        assertTrue(HectorCallEndResult.parse("""{"saved":true,"lines":1}""")!!.kept)
        assertTrue(HectorCallEndResult.parse("""{"saved":false,"reason":"already_saved"}""")!!.kept)
        for (r in listOf("no_recap", "write_failed", "not_configured", "short_call", "not_pro", "entitlement_unavailable", "nothing_to_keep")) {
            assertFalse(HectorCallEndResult.parse("""{"saved":false,"reason":"$r"}""")!!.kept, r)
        }
    }

    @Test
    fun `a greeting that takes too long falls back to the local template`() = runBlocking {
        val o = HectorOpening.resolve("en", HectorGreetingVariants({ null }, { _, _ -> }), "local", timeoutMillis = 50) {
            kotlinx.coroutines.delay(5_000); HectorGreetingReply("late", null, 0, false)
        }
        assertEquals(HectorOpening("local", false, "network"), o)
    }

    @Test
    fun `call end and greeting answers parse`() {
        assertEquals(HectorCallEndResult(true, 2), HectorCallEndResult.parse("""{"saved":true,"lines":2}"""))
        assertEquals(HectorCallEndResult(false, 0, "not_pro"), HectorCallEndResult.parse("""{"saved":false,"reason":"not_pro"}"""))
        assertEquals(null, HectorCallEndResult.parse("{}"))
        assertEquals(HectorGreetingReply("Hi", null, 0, false), HectorGreetingReply.parse("""{"greeting":"Hi","topic":null,"variant":0,"remembered":false}"""))
        assertEquals(null, HectorGreetingReply.parse("""{"greeting":" "}"""))
    }

    private fun variants(store: MutableMap<String, Int>) = HectorGreetingVariants({ store[it] }, { k, v -> store[k] = v })

    @Test
    fun `the server greeting is used and its variant remembered per course`() = runBlocking {
        val store = HashMap<String, Int>()
        val o = HectorOpening.resolve("fr", variants(store), "local") { HectorGreetingReply("Salut", "travel", 2, true) }
        assertEquals(HectorOpening("Salut", true), o)
        assertEquals(2, variants(store).last("fr"))
        assertEquals(null, variants(store).last("en"))
    }

    @Test
    fun `the remembered variant is sent back as lastVariant`() = runBlocking {
        val store = hashMapOf("hector.greetingVariant.es" to 1)
        var sent: Int? = null
        HectorOpening.resolve("es", variants(store), "local") { sent = it; HectorGreetingReply("Hola", null, 0, false) }
        assertEquals(1, sent)
    }

    @Test
    fun `a failing or empty greeting falls back to the local template and keeps the variant`() = runBlocking {
        val store = HashMap<String, Int>()
        val failed = HectorOpening.resolve("en", variants(store), "local") { throw IOException("offline") }
        assertEquals(HectorOpening("local", false, "network"), failed)
        val empty = HectorOpening.resolve("en", variants(store), "local") { HectorGreetingReply("  ", null, 1, false) }
        assertEquals("local", empty.text)
        assertFalse(empty.fromServer)
        assertEquals(null, variants(store).last("en"))
    }

    @Test
    fun `failures are named by reason`() {
        assertEquals("consent", HectorCall.failureReason(AiConversationError.Server(403, null, "ai-consent-required")))
        assertEquals("quota", HectorCall.failureReason(AiConversationError.Server(429, null, "quota-exceeded")))
        assertEquals("auth", HectorCall.failureReason(AiConversationError.Server(401, null)))
        assertEquals("auth", HectorCall.failureReason(TutorConversationError.Server(403, null, "not-entitled")))
        assertEquals("network", HectorCall.failureReason(IOException("offline")))
        assertEquals("network", HectorCall.failureReason(AiConversationError.Timeout()))
        assertEquals("server", HectorCall.failureReason(AiConversationError.Server(500, null)))
        assertEquals("server", HectorCall.failureReason(IllegalStateException()))
    }
}
