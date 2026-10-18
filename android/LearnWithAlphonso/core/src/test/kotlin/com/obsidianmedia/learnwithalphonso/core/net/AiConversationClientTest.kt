package com.obsidianmedia.learnwithalphonso.core.net

import io.ktor.client.plugins.HttpTimeoutCapability
import com.obsidianmedia.learnwithalphonso.core.logic.BillingPeriodUnit
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordError
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordException
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordResult
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
    fun `the conversation's course rides on chat, speech, analysis and the tutor, and is absent when not given`() = runTest {
        val seen = ArrayList<Seen>()
        val c = AiConversationClient(http(seen) { s ->
            when {
                s.path.endsWith("tts") -> byteArrayOf(1) to HttpStatusCode.OK
                s.path.endsWith("analyze-weaknesses") -> """{"weaknessesDetected":0}""".toByteArray() to HttpStatusCode.OK
                else -> """{"content":"Bonjour"}""".toByteArray() to HttpStatusCode.OK
            }
        })
        c.chat(listOf(ChatMessage("user", "hi")), systemPrompt = "P", cefrLevel = "B1", course = "fr")
        assertEquals("""{"messages":[{"role":"user","content":"hi"}],"systemPrompt":"P","cefrLevel":"B1","course":"fr"}""", seen[0].body.decodeToString())
        c.synthesizeSpeech("salut", course = "fr")
        assertEquals("""{"text":"salut","course":"fr"}""", seen[1].body.decodeToString())
        c.analyzeWeaknesses(listOf(ChatMessage("user", "a")), course = "es")
        assertTrue(seen[2].body.decodeToString().endsWith(""","course":"es"}"""))
        // And absent when not given: an older caller's bodies are unchanged.
        c.chat(listOf(ChatMessage("user", "hi")))
        c.synthesizeSpeech("salut")
        c.analyzeWeaknesses(listOf(ChatMessage("user", "a")))
        assertTrue(seen.drop(3).none { it.body.decodeToString().contains("course") })
    }

    @Test
    fun `the tutor call carries the course and the level when given, and neither when not`() = runTest {
        val seen = ArrayList<Seen>()
        val reply = """{"request_id":"r","session_id":"s","agent":"tutor","reply":"Salut","audio_base64":"","tts_model":"m","tts_provider":"p","language":"fr","state":"ok"}"""
        val t = TutorConversationClient(http(seen) { reply.toByteArray() to HttpStatusCode.OK }, "d")
        t.respond("s", "hi", "fr", emptyList(), course = "fr", cefrLevel = "B1")
        val with = seen[0].body.decodeToString()
        assertTrue(with.contains(""""course":"fr""""), with)
        assertTrue(with.contains(""""cefr_level":"B1""""), with)
        t.respond("s", "hi", "en", emptyList(), course = "en", cefrLevel = "")
        assertTrue(!seen[1].body.decodeToString().contains("cefr_level"))
        t.respond("s", "hi", "en", emptyList())
        val bare = seen[2].body.decodeToString()
        assertTrue(!bare.contains("\"course\"") && !bare.contains("cefr_level"), bare)
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
    fun `server errors carry the code and reset time apart from the detail, and generate-practice decodes questions`() = runBlocking {
        val err = AiConversationClient(http(ArrayList()) {
            """{"error":"quota-exceeded","resetsAt":"2026-10-17T00:00:00.000Z","message":"Daily limit"}""".toByteArray() to HttpStatusCode.TooManyRequests
        })
        val e = runCatching { err.chat(listOf(ChatMessage("user", "x"))) }.exceptionOrNull() as AiConversationError.Server
        assertEquals(429, e.status)
        assertEquals("quota-exceeded", e.code)
        assertEquals("2026-10-17T00:00:00.000Z", e.resetsAt)
        assertNull(e.serverMessage)
        val seen = ArrayList<Seen>()
        val ok = AiConversationClient(http(seen) { """{"questions":[{"prompt":"p","choices":["a","b"],"answerIndex":1,"explanation":"e"},{"prompt":"bad"}]}""".toByteArray() to HttpStatusCode.OK })
        val qs = ok.generatePractice("u1l1", "en")
        assertEquals(listOf(GeneratedPracticeQuestion("p", listOf("a", "b"), 1, "e")), qs)
        assertEquals("""{"lessonId":"u1l1","course":"en"}""", seen.single().body.decodeToString())
    }

    @Test
    fun `chat retries once on an empty reply`() = runTest {
        val seen = ArrayList<Seen>()
        val c = AiConversationClient(http(seen) {
            if (seen.size == 1) """{"error":"empty-reply"}""".toByteArray() to HttpStatusCode.BadGateway
            else """{"content":"Hola"}""".toByteArray() to HttpStatusCode.OK
        })
        assertEquals("Hola", c.chat(listOf(ChatMessage("user", "hi"))))
        assertEquals(2, seen.size)
        assertEquals(seen[0].body.decodeToString(), seen[1].body.decodeToString())
    }

    @Test
    fun `chat gives up after a second empty reply and does not retry other 502s`() = runTest {
        val seen = ArrayList<Seen>()
        val c = AiConversationClient(http(seen) { """{"error":"empty-reply"}""".toByteArray() to HttpStatusCode.BadGateway })
        val e = runCatching { c.chat(listOf(ChatMessage("user", "hi"))) }.exceptionOrNull() as AiConversationError.Server
        assertEquals("empty-reply", e.code)
        assertEquals(2, seen.size)
        assertEquals(AiErrorCopy.GENERIC, AiErrorCopy.userMessage(e))

        val other = ArrayList<Seen>()
        val c2 = AiConversationClient(http(other) { """{"error":"something-else"}""".toByteArray() to HttpStatusCode.BadGateway })
        runCatching { c2.chat(listOf(ChatMessage("user", "hi"))) }
        assertEquals(1, other.size)
    }

    @Test
    fun `error copy matches iOS and web and never shows a machine code`() {
        val now = java.time.Instant.parse("2026-10-16T20:00:00Z")
        val utc = java.time.ZoneId.of("UTC")
        fun msg(status: Int, code: String?, resetsAt: String? = null) =
            AiErrorCopy.userMessage(AiConversationError.Server(status, null, code, resetsAt), now, utc)
        assertEquals("You've reached today's AI practice limit. Try again tomorrow.", msg(429, "quota-exceeded"))
        assertEquals("You've reached today's AI practice limit. It resets at 12:00 AM.", msg(429, "quota-exceeded", "2026-10-17T00:00:00.000Z"))
        assertEquals("Too many requests. Wait a minute and try again.", msg(429, "quota-exceeded", "2026-10-16T20:01:00Z"))
        assertEquals("Hector is part of Alphonso Pro.", msg(403, "not-entitled"))
        assertEquals("We can't check your Pro access right now. Please try again shortly.", msg(503, "entitlement-unavailable"))
        assertEquals("Turn on AI features to practise speaking with a tutor.", msg(403, "ai-consent-required"))
        assertEquals("You've been signed out. Please sign in again.", msg(401, "unauthorized"))
        // An upstream 429 without the quota code is not the learner's daily cap.
        assertEquals(AiErrorCopy.GENERIC, msg(429, null))
        assertEquals(AiErrorCopy.GENERIC, msg(502, "empty reply from model"))
        assertEquals(
            "Hector is part of Alphonso Pro.",
            AiErrorCopy.userMessage(TutorConversationError.Server(403, null, "not-entitled"), now, utc),
        )
        assertEquals(AiErrorCopy.CONNECTION, AiErrorCopy.userMessage(java.io.IOException("offline"), now, utc))
        assertEquals(AiErrorCopy.GENERIC, AiErrorCopy.userMessage(IllegalStateException("x"), now, utc))
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
        val down = TutorConversationClient(http(ArrayList()) { """{"error":"tutor-unavailable","detail":"tutor offline"}""".toByteArray() to HttpStatusCode.ServiceUnavailable }, "d")
        val e = runCatching { down.respond("s", "t", "en", emptyList()) }.exceptionOrNull() as TutorConversationError.Server
        assertEquals("tutor offline", e.serverMessage)
        assertEquals("tutor-unavailable", e.code)
        assertNull(TutorReply("", "", "", "x", "", "", "", "", "", null).audioBytes())
    }

    @Test
    fun `priming message and billing period vectors`() {
        assertNull(TutorMemoryContext.buildPrimingMessage(null, emptyList()))
        assertNull(TutorMemoryContext.buildPrimingMessage("", emptyList()))
        assertEquals(
            ChatMessage("user", "[Background for you, the tutor, not part of what the learner said: their current level is B1. Use this naturally if it's relevant, but don't just recite it back.]"),
            TutorMemoryContext.buildPrimingMessage("B1", emptyList()),
        )
        assertEquals(
            "[Background for you, the tutor, not part of what the learner said: their current level is A2; they've recently been working on: past tense, articles, plurals. Use this naturally if it's relevant, but don't just recite it back.]",
            TutorMemoryContext.buildPrimingMessage("A2", listOf("past-tense", "articles", "plurals", "fourth"))!!.content,
        )
        assertEquals("Billed monthly", billingPeriodDescription(BillingPeriodUnit.MONTH, 1))
        assertEquals("Billed every 3 months", billingPeriodDescription(BillingPeriodUnit.MONTH, 3))
        assertEquals("Billed yearly", billingPeriodDescription(BillingPeriodUnit.YEAR, 1))
        assertEquals("Billed every 2 weeks", billingPeriodDescription(BillingPeriodUnit.WEEK, 2))
    }

    private val savedBody = """{"alreadySaved":false,"word":"tea","sentence":"I like tea.","explanation":"\"tea\" means a drink."}"""

    @Test
    fun `defineWord posts the word, sentence and course with the bearer token and decodes the saved word`() = runTest {
        val seen = ArrayList<Seen>()
        val c = AiConversationClient(http(seen) { savedBody.toByteArray() to HttpStatusCode.OK })
        val result = c.defineWord("tea", "I like tea.", "en")
        assertEquals("/api/define-word", seen.single().path)
        assertEquals("""{"word":"tea","sentence":"I like tea.","course":"en"}""", seen.single().body.decodeToString())
        assertEquals("Bearer tok", seen.single().headers["Authorization"])
        assertEquals(SavedWordResult(false, "tea", "I like tea.", "\"tea\" means a drink."), result)
    }

    @Test
    fun `defineWord decodes an already saved word`() = runTest {
        val c = AiConversationClient(http(ArrayList()) { savedBody.replace("false", "true").toByteArray() to HttpStatusCode.OK })
        assertTrue(c.defineWord("tea", "I like tea.", "en").alreadySaved)
    }

    @Test
    fun `defineWord maps each failing status and the consent refusal to its own error`() = runTest {
        val cases = listOf(
            400 to SavedWordError.INVALID, 401 to SavedWordError.NOT_SIGNED_IN, 409 to SavedWordError.LIMIT_REACHED,
            429 to SavedWordError.QUOTA_EXCEEDED, 502 to SavedWordError.UNAVAILABLE,
        )
        for ((status, expected) in cases) {
            val c = AiConversationClient(http(ArrayList()) { """{"error":"x"}""".toByteArray() to HttpStatusCode.fromValue(status) })
            val e = runCatching { c.defineWord("tea", "I like tea.", "en") }.exceptionOrNull() as SavedWordException
            assertEquals(expected, e.error, "status $status")
        }
        val consent = AiConversationClient(http(ArrayList()) { """{"error":"ai-consent-required"}""".toByteArray() to HttpStatusCode.Forbidden })
        assertEquals(SavedWordError.AI_CONSENT_REQUIRED, (runCatching { consent.defineWord("tea", "I like tea.", "en") }.exceptionOrNull() as SavedWordException).error)
    }

    @Test
    fun `defineWord does not call a 200 of the wrong shape a save`() = runTest {
        for (body in listOf("""{"word":"tea"}""", "not json", """{"alreadySaved":"yes","word":"a","sentence":"b","explanation":"c"}""")) {
            val c = AiConversationClient(http(ArrayList()) { body.toByteArray() to HttpStatusCode.OK })
            val e = runCatching { c.defineWord("tea", "I like tea.", "en") }.exceptionOrNull() as SavedWordException
            assertEquals(SavedWordError.UNAVAILABLE, e.error, body)
        }
    }

    @Test
    fun `defineWord asks for a 60 second timeout, and other calls keep the client's default`() = runTest {
        val timeouts = ArrayList<Pair<String, Long?>>()
        val engine = MockEngine { req ->
            timeouts.add(req.url.encodedPath to req.getCapabilityOrNull(HttpTimeoutCapability)?.requestTimeoutMillis)
            respond(if (req.url.encodedPath.endsWith("define-word")) savedBody.toByteArray() else """{"content":"hi"}""".toByteArray(), HttpStatusCode.OK)
        }
        val c = AiConversationClient(ApiHttp("https://learn.alphonsoecosystem.app", { "tok" }, engine))
        c.defineWord("tea", "I like tea.", "en")
        c.chat(listOf(ChatMessage("user", "hi")))
        assertEquals(listOf("/api/define-word" to 60_000L, "/api/chat" to null), timeouts)
    }

    @Test
    fun `defineWord does not take the string true for a boolean`() = runTest {
        val c = AiConversationClient(http(ArrayList()) { """{"alreadySaved":"true","word":"tea","sentence":"I like tea.","explanation":"x"}""".toByteArray() to HttpStatusCode.OK })
        val e = runCatching { c.defineWord("tea", "I like tea.", "en") }.exceptionOrNull() as SavedWordException
        assertEquals(SavedWordError.UNAVAILABLE, e.error)
    }
}
