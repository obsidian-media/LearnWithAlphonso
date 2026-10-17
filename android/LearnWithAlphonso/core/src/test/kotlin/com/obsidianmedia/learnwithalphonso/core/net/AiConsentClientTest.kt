package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentBackend
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentCache
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentStore
import com.obsidianmedia.learnwithalphonso.core.logic.CachedAiConsent
import com.obsidianmedia.learnwithalphonso.core.logic.consentRefusalHook
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.statement.bodyAsText
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AiConsentClientTest {
    private fun fake(body: String, status: HttpStatusCode = HttpStatusCode.OK) = FakeSupabase { json(body, status) }

    private fun client(s: FakeSupabase) = ProgressSyncClient(s.http)

    @Test
    fun `get_ai_consent returns the stored timestamp, or null when AI was never allowed`() = runTest {
        val allowed = fake(""""2026-10-16T10:00:00+00:00"""")
        assertEquals("2026-10-16T10:00:00+00:00", client(allowed).fetchAiConsent())
        assertEquals("/rest/v1/rpc/get_ai_consent", allowed.seen.single().path)
        assertEquals("{}", allowed.seen.single().body)
        assertNull(client(fake("null")).fetchAiConsent())
    }

    @Test
    fun `set_ai_consent sends the _granted flag`() = runTest {
        val s = fake(""""2026-10-16T10:00:00+00:00"""")
        client(s).setAiConsent(true)
        assertEquals("/rest/v1/rpc/set_ai_consent", s.seen.single().path)
        assertEquals("""{"_granted":true}""", s.seen.single().body)
        val withdrawn = fake("null")
        assertNull(client(withdrawn).setAiConsent(false))
        assertEquals("""{"_granted":false}""", withdrawn.seen.single().body)
    }

    @Test
    fun `a server error is thrown, never read as a denial`() = runTest {
        val s = fake("""{"message":"boom"}""", HttpStatusCode.InternalServerError)
        assertThrows(ProgressSyncError.Server::class.java) { kotlinx.coroutines.runBlocking { client(s).fetchAiConsent() } }
    }

    @Test
    fun `an unexpected shape is an invalid payload`() = runTest {
        assertThrows(ProgressSyncError.InvalidPayload::class.java) { kotlinx.coroutines.runBlocking { client(fake("""{"a":1}""")).fetchAiConsent() } }
        assertThrows(ProgressSyncError.InvalidPayload::class.java) { kotlinx.coroutines.runBlocking { client(fake("true")).fetchAiConsent() } }
    }

    @Test
    fun `the app wiring closes the gate on a 403 and the caller can still read the body`() = runTest {
        val backend = object : AiConsentBackend {
            override fun currentUserId() = "u1"
            override suspend fun fetch(): String? = null // the account really has no consent
            override suspend fun set(granted: Boolean): String? = null
        }
        val cache = object : AiConsentCache {
            override fun read(userId: String) = CachedAiConsent("2026-10-01T00:00:00+00:00")
            override fun write(userId: String, grantedAt: String?) = Unit
        }
        val store = AiConsentStore(backend, cache)
        assertTrue(store.isGranted)
        val engine = MockEngine { respond("""{"error":"ai-consent-required"}""", HttpStatusCode.Forbidden) }
        // Exactly what AppContainer passes: the store's own hook, on a scope that runs inline.
        val scope = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.Unconfined)
        val http = ApiHttp("https://learn.alphonsoecosystem.app", { "tok" }, engine, onAiConsentRequired = store.consentRefusalHook(scope))
        val response = http.post("api/chat", null)
        // The refusal closed the gate: the cached grant is gone and the re-read confirmed the account says no.
        assertEquals(com.obsidianmedia.learnwithalphonso.core.logic.AiConsentStatus.DENIED, store.statusOf())
        assertEquals("""{"error":"ai-consent-required"}""", response.bodyAsText())
        assertEquals(HttpStatusCode.Forbidden, response.status)
    }

    @Test
    fun `a 403 ai-consent-required on an API route notifies the consent store hook, nothing else does`() = runTest {
        var notified = 0
        fun http(status: HttpStatusCode, body: String): ApiHttp {
            val engine = MockEngine { respond(body, status) }
            return ApiHttp("https://learn.alphonsoecosystem.app", { "tok" }, engine, onAiConsentRequired = { notified++ })
        }
        http(HttpStatusCode.Forbidden, """{"error":"ai-consent-required"}""").post("api/chat", null)
        assertEquals(1, notified)
        // A 503 consent-check-failed is not a consent problem, and a 403 for another reason is not either.
        http(HttpStatusCode.ServiceUnavailable, """{"error":"consent-check-failed"}""").post("api/chat", null)
        http(HttpStatusCode.Forbidden, """{"error":"not-entitled"}""").post("api/chat", null)
        http(HttpStatusCode.OK, """{"error":"ai-consent-required"}""").post("api/chat", null)
        assertEquals(1, notified)
    }
}
