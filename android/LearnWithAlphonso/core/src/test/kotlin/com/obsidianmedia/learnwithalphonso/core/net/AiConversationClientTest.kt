package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.logic.BillingPeriodUnit
import com.obsidianmedia.learnwithalphonso.core.logic.TutorMemoryContext
import com.obsidianmedia.learnwithalphonso.core.logic.billingPeriodDescription
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AiConversationClientTest {
    private data class Seen(val path: String, val headers: Map<String, String>, val contentType: String?, val body: ByteArray)

    private fun http(seen: MutableList<Seen>, handler: suspend (Seen) -> Pair<ByteArray, HttpStatusCode>): ApiHttp {
        val engine = MockEngine { req ->
            val s = Seen(req.url.encodedPath, req.headers.entries().associate { (k, v) -> k to v.first() }, req.body.contentType?.toString(), req.body.toByteArray())
            seen.add(s)
            val (body, status) = handler(s)
            respond(body, status)
        }
        return ApiHttp("https://learn.alphonsoecosystem.app", { "tok" }, engine)
    }

    @Test
    fun `chat posts messages with optional prompt and level and decodes content`() = runTest {
        val seen = ArrayList<Seen>()
        val c = AiConversationClient(http(seen) { """{"content":"Bonjour!"}""".toByteArray() to HttpStatusCode.OK })
        assertEquals("Bonjour!", c.chat(listOf(ChatMessage("user", "hi")), systemPrompt = "Be nice", cefrLevel = "B1"))
        assertEquals("/api/chat", seen.single().path)
        assertEquals("""{"messages":[{"role":"user","content":"hi"}],"systemPrompt":"Be nice","cefrLevel":"B1"}""", seen.single().body.decodeToString())
        assertEquals("Bearer tok", seen.single().headers["Authorization"])
    }

    @Test
    fun `tts returns raw bytes and analyze decodes the count`() = runTest {
        val seen = ArrayList<Seen>()
        val c = AiConversationClient(http(seen) { s -> if (s.path.endsWith("tts")) byteArrayOf(1, 2, 3) to HttpStatusCode.OK else """{"weaknessesDetected":2}""".toByteArray() to HttpStatusCode.OK })
        assertArrayEquals(byteArrayOf(1, 2, 3), c.synthesizeSpeech("hello"))
        assertEquals("""{"text":"hello"}""", seen[0].body.decodeToString())
        assertEquals(2, c.analyzeWeaknesses(listOf(ChatMessage("user", "a"), ChatMessage("assistant", "b"))))
        assertTrue(seen[1].body.decodeToString().contains(""""messages":[{"role":"user","content":"a"}"""))
    }

    @Test
    fun `transcribe uploads multipart with the file field, course and timing`() = runTest {
        val seen = ArrayList<Seen>()
        val c = AiConversationClient(http(seen) { """{"text":"she is a doctor","confidence":0.91}""".toByteArray() to HttpStatusCode.OK })
        val audio = ByteArray(5000) { (it % 251).toByte() }
        val result = c.transcribe(audio, "audio/m4a", course = "fr", debugTiming = "press=1.20 capture=1.10")
        assertEquals(SttResult("she is a doctor", 0.91), result)
        val req = seen.single()
        assertEquals("/api/stt", req.path)
        assertTrue(req.contentType!!.startsWith("multipart/form-data"))
        val body = req.body.decodeToString(throwOnInvalidSequence = false)
        assertTrue(body.contains("""name=file""") || body.contains("""name="file""""))
        assertTrue(body.contains("""filename="recording.m4a""""))
        assertTrue(body.contains("Content-Type: audio/m4a"))
        assertTrue(body.contains("name=course") || body.contains("""name="course""""))
        assertTrue(body.contains("press=1.20 capture=1.10"))
        assertTrue(req.body.size > 5000)
        val noConfidence = AiConversationClient(http(ArrayList()) { """{"text":"hola"}""".toByteArray() to HttpStatusCode.OK })
        assertNull(noConfidence.transcribe(audio).confidence)
    }

    @Test
    fun `server errors surface the error field and generate-practice decodes questions`() = runBlocking {
        val err = AiConversationClient(http(ArrayList()) { """{"error":"quota exhausted"}""".toByteArray() to HttpStatusCode.TooManyRequests })
        val e = runCatching { err.chat(listOf(ChatMessage("user", "x"))) }.exceptionOrNull() as AiConversationError.Server
        assertEquals(429, e.status)
        assertEquals("quota exhausted", e.serverMessage)
        val seen = ArrayList<Seen>()
        val ok = AiConversationClient(http(seen) { """{"questions":[{"prompt":"p","choices":["a","b"],"answerIndex":1,"explanation":"e"},{"prompt":"bad"}]}""".toByteArray() to HttpStatusCode.OK })
        val qs = ok.generatePractice("u1l1", "en")
        assertEquals(listOf(GeneratedPracticeQuestion("p", listOf("a", "b"), 1, "e")), qs)
        assertEquals("""{"lessonId":"u1l1","course":"en"}""", seen.single().body.decodeToString())
    }

    @Test
    fun `generate-practice times out`() = runBlocking {
        // Plan 3 Review Focus 5. Real time, with the timeout shortened for the test; production keeps 45 s.
        assertEquals(45_000L, AiConversationClient.GENERATE_TIMEOUT_MS)
        val c = AiConversationClient(http(ArrayList()) { delay(2_000); "{}".toByteArray() to HttpStatusCode.OK })
        assertTrue(runCatching { c.generatePractice("u1l1", "en", timeoutMs = 100) }.exceptionOrNull() is AiConversationError.Timeout)
    }

    @Test
    fun `tutor client sends the device header and body and decodes the snake_case reply`() = runTest {
        val seen = ArrayList<Seen>()
        val http = http(seen) {
            """{"request_id":"r1","session_id":"s1","agent":"tutor","reply":"Hello there","audio_base64":"AQID","tts_model":"magpie","tts_provider":"nvidia","language":"en","state":"ok","timings_ms":{"llm":10,"tts":20,"total":30}}""".toByteArray() to HttpStatusCode.OK
        }
        val t = TutorConversationClient(http, "device-1")
        val reply = t.respond("s1", "hi", "en", listOf(ChatMessage("user", "hi")))
        assertEquals("Hello there", reply.reply)
        assertArrayEquals(byteArrayOf(1, 2, 3), reply.audioBytes())
        assertEquals(TutorTimings(10, 20, 30), reply.timingsMs)
        assertEquals("/api/hector-respond", seen.single().path)
        assertEquals("device-1", seen.single().headers["X-Alphonso-Device-Id"])
        assertEquals("""{"session_id":"s1","text":"hi","language":"en","agent_id":"tutor","tts_model":"magpie","piper_voice":"mana","history":[{"role":"user","content":"hi"}]}""", seen.single().body.decodeToString())
        val down = TutorConversationClient(http(ArrayList()) { """{"detail":"tutor offline"}""".toByteArray() to HttpStatusCode.ServiceUnavailable }, "d")
        val e = runCatching { down.respond("s", "t", "en", emptyList()) }.exceptionOrNull() as TutorConversationError.Server
        assertEquals("tutor offline", e.serverMessage)
        assertNull(TutorReply("", "", "", "x", "", "", "", "", "", null).audioBytes())
    }

    @Test
    fun `priming message and billing period vectors`() {
        assertNull(TutorMemoryContext.buildPrimingMessage(null, emptyList()))
        assertNull(TutorMemoryContext.buildPrimingMessage("", emptyList()))
        assertEquals(
            ChatMessage("user", "[Background for you, the tutor, not part of what the learner said: their current English level is B1. Use this naturally if it's relevant, but don't just recite it back.]"),
            TutorMemoryContext.buildPrimingMessage("B1", emptyList()),
        )
        assertEquals(
            "[Background for you, the tutor, not part of what the learner said: their current English level is A2; they've recently been working on: past tense, articles, plurals. Use this naturally if it's relevant, but don't just recite it back.]",
            TutorMemoryContext.buildPrimingMessage("A2", listOf("past-tense", "articles", "plurals", "fourth"))!!.content,
        )
        assertEquals("Billed monthly", billingPeriodDescription(BillingPeriodUnit.MONTH, 1))
        assertEquals("Billed every 3 months", billingPeriodDescription(BillingPeriodUnit.MONTH, 3))
        assertEquals("Billed yearly", billingPeriodDescription(BillingPeriodUnit.YEAR, 1))
        assertEquals("Billed every 2 weeks", billingPeriodDescription(BillingPeriodUnit.WEEK, 2))
    }
}
