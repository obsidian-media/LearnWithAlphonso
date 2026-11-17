package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.logic.CallRecap
import com.obsidianmedia.learnwithalphonso.core.logic.TutorMemory
import com.obsidianmedia.learnwithalphonso.core.logic.TutorMemoryLoad
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class CallRecapTest {
    private data class Seen(val method: HttpMethod, val path: String, val body: String)

    private fun client(seen: MutableList<Seen>, status: HttpStatusCode = HttpStatusCode.OK, body: String = "{}"): AiConversationClient {
        val engine = MockEngine { req ->
            seen.add(Seen(req.method, req.url.encodedPath, req.body.toByteArray().decodeToString()))
            respond(body.toByteArray(), status)
        }
        return AiConversationClient(ApiHttp("https://learn.alphonsoecosystem.app", { "tok" }, engine))
    }

    private fun call(learnerTurns: Int) = (0 until learnerTurns).flatMap { listOf(ChatMessage("user", "u$it"), ChatMessage("assistant", "ok")) }

    private val recapBody = """{"recap":{"corrections":[{"said":"Soy cansado","fixed":"Estoy cansado","why":"estar","topic":"ser-estar","label":"Ser or estar"}],
        "phrase":{"text":"¿Me trae la cuenta?","meaning":"Could you bring me the bill?"},"reviewToken":"tok.sig","saved":true,"reviewCount":2}}"""

    @Test
    fun `a call under three learner replies sends nothing`() = runTest {
        val seen = ArrayList<Seen>()
        assertNull(client(seen, body = recapBody).callRecap("c1", call(2)))
        assertTrue(seen.isEmpty())
        assertFalse(CallRecap.qualifies(listOf("user", "user", "assistant")))
        assertTrue(CallRecap.qualifies(listOf("user", "user", "user")))
    }

    @Test
    fun `the recap posts the call and parses the answer`() = runTest {
        val seen = ArrayList<Seen>()
        val r = client(seen, body = recapBody).callRecap("c1", call(3), cefrLevel = "A2", scene = "coffee")
        assertEquals("/api/call-recap", seen.single().path)
        assertTrue(seen.single().body.contains(""""callId":"c1""""))
        assertNotNull(r)
        assertEquals("Estoy cansado", r!!.corrections.single().fixed)
        assertEquals("Ser or estar", r.corrections.single().label)
        assertEquals("¿Me trae la cuenta?", r.phrase?.text)
        assertEquals("tok.sig", r.reviewToken)
        assertTrue(r.saved)
        assertEquals(2, r.reviewCount)
    }

    @Test
    fun `every hidden state is null`() = runTest {
        val t = call(3)
        assertNull(client(ArrayList(), body = """{"recap":null}""").callRecap("c", t))
        assertNull(client(ArrayList(), body = """{"recap":{"corrections":[],"phrase":null}}""").callRecap("c", t))
        assertNull(client(ArrayList(), body = "not json").callRecap("c", t))
        for (code in listOf(403, 429, 503, 500)) {
            assertNull(client(ArrayList(), HttpStatusCode.fromValue(code), """{"error":"x"}""").callRecap("c", t), "status $code")
        }
    }

    @Test
    fun `review these sends the token back`() = runTest {
        val seen = ArrayList<Seen>()
        assertTrue(client(seen, body = """{"added":2}""").addRecapToReview("c1", "tok.sig"))
        assertEquals("/api/call-recap-review", seen.single().path)
        assertTrue(seen.single().body.contains(""""reviewToken":"tok.sig""""))
        assertFalse(client(ArrayList(), HttpStatusCode.BadRequest).addRecapToReview("c1", "x"))
    }

    private val memoryBody = """{"mistakes":[{"id":"m1","course":"es","topic":"ser-estar","label":"Ser or estar","example":"x","seenCount":4,"lastSeenAt":"2026-11-14T10:00:00.000Z"}],
        "phrases":[{"id":"p1","course":"es","text":"¿Me trae la cuenta?","meaning":"Could you bring me the bill?"}],
        "goals":{"goal":"travel","dailyMinutes":10,"interests":["food","music"]}}"""

    @Test
    fun `memory is ready for Pro, locked for 403 and failed otherwise`() = runTest {
        val ready = client(ArrayList(), body = memoryBody).tutorMemory()
        assertTrue(ready is TutorMemoryLoad.Ready)
        val m = (ready as TutorMemoryLoad.Ready).memory
        assertEquals("Ser or estar", m.mistakes.single().label)
        assertEquals("1 mistake, 1 phrase, 3 goals.", m.summary)
        assertEquals(TutorMemoryLoad.Locked, client(ArrayList(), HttpStatusCode.Forbidden).tutorMemory())
        assertEquals(TutorMemoryLoad.Failed, client(ArrayList(), HttpStatusCode.InternalServerError).tutorMemory())
    }

    @Test
    fun `goal lines are the learner's own answers and nothing else`() {
        val m = TutorMemory(emptyList(), emptyList(), TutorMemory.Goals("travel", 10, listOf("food", "music")))
        assertEquals(listOf("Travel", "10 minutes a day", "Food and music"), m.goalLines.map { it.title })
        val odd = TutorMemory(emptyList(), emptyList(), TutorMemory.Goals("world domination", 7, listOf("x")))
        assertTrue(odd.goalLines.isEmpty())
        assertTrue(odd.isEmpty)
    }

    @Test
    fun `ago labels and the mistake note`() {
        val now = Instant.parse("2026-11-16T12:00:00Z")
        fun ago(d: Long) = TutorMemory.agoLabel(now.minusSeconds(d * 86_400), now)
        assertEquals(listOf("today", "yesterday", "2 days ago", "last week", "3 weeks ago", "2 months ago"), listOf(0L, 1, 2, 8, 21, 75).map { ago(it) })
        fun note(seen: Int, d: Long) = TutorMemory.Mistake("i", "t", "l", seen, now.minusSeconds(d * 86_400)).note(now)
        assertEquals("Seen in 4 calls, last 2 days ago", note(4, 2))
        assertEquals("Seen in 2 calls, last week", note(2, 9))
        assertEquals("Seen in 1 call, last today", note(1, 0))
    }

    @Test
    fun `deletes use the right method and body`() = runTest {
        val seen = ArrayList<Seen>()
        assertTrue(client(seen).removeMemoryLine("m1"))
        assertTrue(client(seen).forgetEverything())
        assertEquals(HttpMethod.Delete, seen[0].method)
        assertEquals("""{"id":"m1"}""", seen[0].body)
        assertEquals("""{"all":true}""", seen[1].body)
        assertFalse(client(ArrayList(), HttpStatusCode.InternalServerError).forgetEverything())
    }
}
