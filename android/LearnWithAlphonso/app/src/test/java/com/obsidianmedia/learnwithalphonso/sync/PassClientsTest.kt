package com.obsidianmedia.learnwithalphonso.sync

import com.obsidianmedia.learnwithalphonso.core.auth.AccountChangedException
import com.obsidianmedia.learnwithalphonso.core.auth.SessionManager
import com.obsidianmedia.learnwithalphonso.core.auth.SessionStore
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseAuthClient
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseSession
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** AppContainer builds each pass's client with [PassClients]: it must go through freshAccessTokenFor, not freshAccessToken. */
class PassClientsTest {
    private val now = 1_758_000_000L

    private class MemoryStore(var session: SupabaseSession?) : SessionStore {
        override fun load() = session
        override fun save(session: SupabaseSession) { this.session = session }
        override fun clear() { session = null }
    }

    private val authEngine = MockEngine { respond("""{"access_token":"new-at","refresh_token":"new-rt","expires_in":3600,"user":{"id":"u1"}}""", HttpStatusCode.OK) }

    private suspend fun session(user: String = "u1"): SessionManager {
        val m = SessionManager(SupabaseAuthClient("https://x.supabase.co", "pk", authEngine) { now }, MemoryStore(SupabaseSession("at-$user", "rt", now + 3600, user))) { now }
        m.restore()
        return m
    }

    private class Api {
        val authorization = ArrayList<String?>()
        val engine = MockEngine { req ->
            authorization.add(req.headers["Authorization"])
            respond("[]", HttpStatusCode.OK, io.ktor.http.headersOf(io.ktor.http.HttpHeaders.ContentType, "application/json"))
        }
    }

    @Test
    fun `a pass client sends its own account's token`() = runBlocking {
        val api = Api()
        val factory = PassClients.factory(session("u1"), "https://x.supabase.co", "pk", api.engine)
        val client = factory("u1")!!
        runCatching { client.fetchProgress() }
        assertEquals(listOf("Bearer at-u1"), api.authorization)
        client.close()
    }

    @Test
    fun `once the account has left, a pass client sends nothing, not even with a refresh`() = runBlocking {
        val api = Api()
        val m = session("u1")
        val client = PassClients.factory(m, "https://x.supabase.co", "pk", api.engine)("u1")!!
        m.signOut()
        val e = runCatching { client.fetchProgress() }.exceptionOrNull()
        assertTrue("the request failed before it was sent: $e", e is AccountChangedException || e?.cause is AccountChangedException)
        assertTrue(api.authorization.isEmpty())
    }

    @Test
    fun `there is no client for a signed-out app, and closing a pass client leaves the shared engine usable`() = runBlocking {
        val api = Api()
        val m = session("u1")
        val factory = PassClients.factory(m, "https://x.supabase.co", "pk", api.engine)
        val first = factory("u1")!!
        first.close()
        val second = factory("u1")!!
        runCatching { second.fetchProgress() }
        assertEquals("the engine is shared and is not closed with one client", 1, api.authorization.size)
        second.close()
        m.signOut()
        assertNull(factory("u1"))
        assertNotNull(api.engine)
    }

    @Test
    fun `a 401 whose retry would refresh another account's session sends nothing the second time`() = runBlocking {
        var signedInAs = "u1"
        val auth = MockEngine { respond("""{"access_token":"at-$signedInAs","refresh_token":"rt","expires_in":3600,"user":{"id":"$signedInAs"}}""", HttpStatusCode.OK) }
        val m = SessionManager(SupabaseAuthClient("https://x.supabase.co", "pk", auth) { now }, MemoryStore(SupabaseSession("at-u1", "rt", now + 3600, "u1"))) { now }
        m.restore()
        val seen = ArrayList<String?>()
        val api = MockEngine { req ->
            seen.add(req.headers["Authorization"])
            if (seen.size == 1) {
                // The first account's request is rejected, and meanwhile someone else signs in.
                signedInAs = "u2"
                m.signInWithPassword("b@example.com", "pw")
                respond("{}", HttpStatusCode.Unauthorized)
            } else {
                respond("[]", HttpStatusCode.OK)
            }
        }
        val client = PassClients.factory(m, "https://x.supabase.co", "pk", api)("u1")!!
        runCatching { client.fetchProgress() }
        assertEquals("the retry is not sent under the second account's token: $seen", listOf<String?>("Bearer at-u1"), seen)
    }
}
