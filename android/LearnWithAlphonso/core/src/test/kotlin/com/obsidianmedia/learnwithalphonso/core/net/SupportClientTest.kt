package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.logic.SupportLinkId
import com.obsidianmedia.learnwithalphonso.core.logic.SupportMessageKind
import com.obsidianmedia.learnwithalphonso.core.logic.SupportStatus
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException

class SupportClientTest {
    private data class Seen(val method: HttpMethod, val path: String, val auth: String?, val body: String)

    private fun client(seen: MutableList<Seen> = ArrayList(), status: HttpStatusCode = HttpStatusCode.OK, body: String = CONVERSATION, failure: Throwable? = null): SupportClient {
        val engine = MockEngine { req ->
            seen.add(Seen(req.method, req.url.encodedPath, req.headers["Authorization"], req.body.toByteArray().decodeToString()))
            if (failure != null) throw failure
            respond(body, status)
        }
        return SupportClient(ApiHttp("https://learn.alphonsoecosystem.app", { "tok" }, engine))
    }

    private fun kindOf(block: suspend () -> Unit): SupportErrorKind {
        var kind: SupportErrorKind? = null
        try { kotlinx.coroutines.runBlocking { block() } } catch (e: SupportException) { kind = e.kind }
        return kind!!
    }

    private companion object {
        const val CONVERSATION = """{"status":"ai","unread":1,"aiAvailable":true,"messages":[
            {"id":1,"kind":"you","body":"Where is Pro?","at":"2026-11-14T09:41:00Z"},
            {"id":2,"kind":"ai","body":"Tap Restore Purchases.","at":"2026-11-14T09:41:05Z","link":"subscription"},
            {"id":3,"kind":"support","body":"Hello from a person","at":"2026-11-14T10:00:00Z"}]}"""
        const val UPDATE = """{"status":"open","messages":[{"id":9,"kind":"you","body":"hi","at":"2026-11-14T09:41:00Z"},{"id":10,"kind":"system","body":"A person will reply here.","at":"2026-11-14T09:41:01Z"}]}"""
    }

    @Test
    fun `the conversation is a GET with the bearer token and decodes status, unread, messages and links`() = runTest {
        val seen = ArrayList<Seen>()
        val c = client(seen).fetchConversation()
        val r = seen.single()
        assertEquals(HttpMethod.Get, r.method)
        assertEquals("/api/support/conversation", r.path)
        assertEquals("Bearer tok", r.auth)
        assertEquals(SupportStatus.AI, c.status)
        assertEquals(1, c.unread)
        assertTrue(c.aiAvailable)
        assertEquals(listOf(SupportMessageKind.YOU, SupportMessageKind.AI, SupportMessageKind.SUPPORT), c.messages.map { it.kind })
        assertEquals(SupportLinkId.SUBSCRIPTION, c.messages[1].link)
        assertNull(c.messages[0].link)
    }

    @Test
    fun `a send posts only the text and the client id`() = runTest {
        val seen = ArrayList<Seen>()
        val u = client(seen, body = UPDATE).send("hi", "client-1")
        val r = seen.single()
        assertEquals(HttpMethod.Post, r.method)
        assertEquals("/api/support/message", r.path)
        val sent = Json.parseToJsonElement(r.body).jsonObject
        assertEquals(setOf("text", "clientId"), sent.keys)
        assertEquals("hi", sent["text"]!!.jsonPrimitive.content)
        assertEquals("client-1", sent["clientId"]!!.jsonPrimitive.content)
        assertEquals(SupportStatus.OPEN, u.status)
        assertEquals(2, u.messages.size)
    }

    @Test
    fun `a hand-off posts an empty object`() = runTest {
        val seen = ArrayList<Seen>()
        client(seen, body = UPDATE).handoff()
        assertEquals("/api/support/handoff", seen.single().path)
        assertEquals("{}", seen.single().body)
    }

    @Test
    fun `a link marker in an ai body is lifted off, and a marker in any other body is left alone`() = runTest {
        val body = """{"status":"ai","unread":0,"aiAvailable":true,"messages":[
            {"id":1,"kind":"ai","body":"Open it.\n\n[[link:league]]","at":"2026-11-14T09:41:00Z"},
            {"id":2,"kind":"you","body":"typed [[link:subscription]]","at":"2026-11-14T09:41:00Z"},
            {"id":3,"kind":"ai","body":"Bad.\n\n[[link:https://evil.example]]","at":"2026-11-14T09:41:00Z","link":"https://evil.example"}]}"""
        val m = client(body = body).fetchConversation().messages
        assertEquals("Open it." to SupportLinkId.LEAGUE, m[0].body to m[0].link)
        assertEquals("typed [[link:subscription]]" to null, m[1].body to m[1].link)
        assertEquals("Bad." to null, m[2].body to m[2].link)
    }

    @Test
    fun `only a person's reply carries a staff first name, trimmed, and an empty one is none`() = runTest {
        val body = """{"status":"open","unread":0,"aiAvailable":true,"messages":[
            {"id":1,"kind":"you","body":"a","at":"2026-11-14T09:41:00Z","staffName":"Forged"},
            {"id":2,"kind":"ai","body":"b","at":"2026-11-14T09:41:00Z","staffName":"Forged"},
            {"id":3,"kind":"system","body":"c","at":"2026-11-14T09:41:00Z","staffName":"Forged"},
            {"id":4,"kind":"support","body":"d","at":"2026-11-14T09:41:00Z","staffName":" Dana "},
            {"id":5,"kind":"support","body":"e","at":"2026-11-14T09:41:00Z","staffName":"  "},
            {"id":6,"kind":"support","body":"f","at":"2026-11-14T09:41:00Z","staffName":null},
            {"id":7,"kind":"support","body":"g","at":"2026-11-14T09:41:00Z"}]}"""
        val m = client(body = body).fetchConversation().messages
        assertEquals(listOf(null, null, null, "Dana", null, null, null), m.map { it.staffName })
    }

    @Test
    fun `a forged link on a non-ai message is dropped`() = runTest {
        val body = """{"status":"open","unread":0,"aiAvailable":false,"messages":[{"id":1,"kind":"support","body":"x","at":"2026-11-14T09:41:00Z","link":"settings"}]}"""
        assertNull(client(body = body).fetchConversation().messages.single().link)
    }

    @Test
    fun `errors map the way the web client does`() {
        assertEquals(SupportErrorKind.UNREACHABLE, SupportClient.errorKind(503, """{"error":"support-unreachable"}"""))
        assertEquals(SupportErrorKind.DAILY_LIMIT, SupportClient.errorKind(429, """{"error":"support-message-limit","which":"daily"}"""))
        assertEquals(SupportErrorKind.DAILY_LIMIT, SupportClient.errorKind(429, """{"error":"support-message-limit"}"""))
        assertEquals(SupportErrorKind.CONVERSATION_LIMIT, SupportClient.errorKind(429, """{"error":"support-message-limit","which":"conversation"}"""))
        assertEquals(SupportErrorKind.FAILED, SupportClient.errorKind(429, """{"error":"something-else"}"""))
        assertEquals(SupportErrorKind.FAILED, SupportClient.errorKind(503, "not json"))
        assertEquals(SupportErrorKind.FAILED, SupportClient.errorKind(500, ""))
    }

    @Test
    fun `a failed status or a transport error surfaces as a kind the screen can show`() {
        assertEquals(SupportErrorKind.UNREACHABLE, kindOf { client(status = HttpStatusCode.ServiceUnavailable, body = """{"error":"support-unreachable"}""").send("x", "c") })
        assertEquals(SupportErrorKind.DAILY_LIMIT, kindOf { client(status = HttpStatusCode.TooManyRequests, body = """{"error":"support-message-limit","which":"daily"}""").send("x", "c") })
        assertEquals(SupportErrorKind.OFFLINE, kindOf { client(failure = IOException("no route")).fetchConversation() })
        assertEquals(SupportErrorKind.FAILED, kindOf { client(status = HttpStatusCode.InternalServerError, body = "").fetchConversation() })
    }

    @Test
    fun `a 200 that is not the contract's shape is a failure, not an empty chat`() {
        for (bad in listOf("{}", "not json", """{"status":"weird","unread":0,"aiAvailable":true,"messages":[]}""", """{"status":"ai","unread":-1,"aiAvailable":true,"messages":[]}""",
            """{"status":"ai","unread":0,"aiAvailable":true,"messages":[{"id":1,"kind":"robot","body":"x","at":"t"}]}""")) {
            assertEquals(SupportErrorKind.FAILED, kindOf { client(body = bad).fetchConversation() }, bad)
        }
    }
}
