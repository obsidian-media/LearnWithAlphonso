package com.obsidianmedia.learnwithalphonso.core.rehearsal

import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.ApiHttp
import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ReplyLatencyAndPausesTest {
    // ---- the measurement ----

    @Test fun `each learner reply records the gap since the partner finished, in order`() {
        val t = ReplyLatencyTracker()
        t.partnerFinished(1_000); t.learnerStarted(1_800)
        t.partnerFinished(10_000); t.learnerStarted(15_500)
        t.partnerFinished(20_000); t.learnerStarted(20_000)
        assertEquals(listOf(800, 5_500, 0), t.values())
    }

    @Test fun `a second start with no new partner turn is not counted twice`() {
        val t = ReplyLatencyTracker()
        t.partnerFinished(0); t.learnerStarted(500); t.learnerStarted(9_000)
        assertEquals(listOf(500), t.values())
    }

    @Test fun `a start with no partner voice before it records nothing`() {
        val t = ReplyLatencyTracker()
        t.learnerStarted(500)
        assertTrue(t.values().isEmpty())
        assertFalse(t.hasValues)
    }

    @Test fun `values are clamped to 0 to 60000`() {
        val t = ReplyLatencyTracker()
        t.partnerFinished(10_000); t.learnerStarted(5_000)       // a clock that went backwards
        t.partnerFinished(0); t.learnerStarted(95_000)            // a very long wait
        assertEquals(listOf(0, 60_000), t.values())
    }

    @Test fun `at most 60 entries are kept, the first ones`() {
        val t = ReplyLatencyTracker()
        for (i in 0 until 75) { t.partnerFinished(0); t.learnerStarted(i.toLong()) }
        val v = t.values()
        assertEquals(60, v.size)
        assertEquals((0 until 60).toList(), v)
    }

    @Test fun `reset forgets everything`() {
        val t = ReplyLatencyTracker()
        t.partnerFinished(0); t.learnerStarted(100); t.partnerFinished(0)
        t.reset()
        t.learnerStarted(900)
        assertTrue(t.values().isEmpty())
    }

    // ---- the recap request ----

    private fun bodySent(latencies: List<Int>): String {
        var sent = ""
        val engine = MockEngine { req -> sent = req.body.toByteArray().decodeToString(); respond("""{"recap":null}""".toByteArray(), HttpStatusCode.OK) }
        val client = AiConversationClient(ApiHttp("https://learn.alphonsoecosystem.app", { "tok" }, engine))
        val t = (0 until 3).flatMap { listOf(ChatMessage("user", "u$it"), ChatMessage("assistant", "ok")) }
        runTest { client.callRecapAttempt("c1", t, replyLatenciesMs = latencies) }
        return sent
    }

    @Test fun `the recap body carries the latencies in order`() {
        val body = Json.parseToJsonElement(bodySent(listOf(800, 5_500, 0))).jsonObject
        assertEquals(JsonArray(listOf(800, 5_500, 0).map { JsonPrimitive(it) }), body["replyLatenciesMs"])
    }

    @Test fun `the field is omitted when there are none`() {
        assertFalse(Json.parseToJsonElement(bodySent(emptyList())).jsonObject.containsKey("replyLatenciesMs"))
    }

    @Test fun `the request clamps and caps even if a caller did not`() {
        val body = Json.parseToJsonElement(bodySent((0 until 70).map { if (it == 0) 99_999 else -5 })).jsonObject
        val arr = body.getValue("replyLatenciesMs") as JsonArray
        assertEquals(60, arr.size)
        assertEquals(JsonPrimitive(60_000), arr[0])
        assertEquals(JsonPrimitive(0), arr[1])
    }

    // ---- the pauses note ----

    private val pauses = RehearsalSpeaking.parse(javaClass.getResource("/rehearsal-pauses-case.json")!!.readText())!!

    @Test fun `the pauses fixture decodes and the pauses note is not the lead`() {
        assertEquals(listOf(SpeakingKind.FULL_REPLIES, SpeakingKind.PAUSES), pauses.notes.map { it.kind })
        assertEquals(SpeakingNote(SpeakingKind.PAUSES, 4, 7, null), pauses.notes[1])
    }

    @Test fun `the sentence names the count and the course's own filler`() {
        val n = pauses.notes[1]
        assertEquals("You took a moment before 4 of 7 answers. That's fine; next time try starting with “Let me think…”.", SpeakingRules.sentence(n, "English", "en"))
        assertEquals("You took a moment before 4 of 7 answers. That's fine; next time try starting with “Laissez-moi réfléchir…”.", SpeakingRules.sentence(n, "French", "fr"))
        assertEquals("You took a moment before 4 of 7 answers. That's fine; next time try starting with “Déjeme pensar…”.", SpeakingRules.sentence(n, "Spanish", "es"))
    }

    @Test fun `a pause never gets a trend arrow, even with an earlier count`() {
        val withPrev = SpeakingNote(SpeakingKind.PAUSES, 5, 7, 2)
        assertEquals(SpeakingTrend(SpeakingTrend.Direction.NONE, false), SpeakingRules.trend(withPrev))
        assertFalse(SpeakingRules.sentence(withPrev, "English").contains("last time"))
    }

    @Test fun `an unknown kind beside a pauses note is still dropped`() {
        val s = RehearsalSpeaking.parse("""{"rehearsalSpeaking":{"notes":[
            {"kind":"pace","count":1,"total":2,"previous":null},{"kind":"pauses","count":3,"total":5,"previous":null}]}}""")
        assertNotNull(s)
        assertEquals(listOf(SpeakingKind.PAUSES), s!!.notes.map { it.kind })
    }
}
