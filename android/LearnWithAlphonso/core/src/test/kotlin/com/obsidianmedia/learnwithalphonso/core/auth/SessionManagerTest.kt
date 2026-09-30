package com.obsidianmedia.learnwithalphonso.core.auth

import com.obsidianmedia.learnwithalphonso.core.net.SupabaseAuthClient
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseSession
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException

class SessionManagerTest {
    private val now = 1_758_000_000L

    private class MemoryStore(var session: SupabaseSession? = null) : SessionStore {
        override fun load() = session
        override fun save(session: SupabaseSession) { this.session = session }
        override fun clear() { session = null }
    }

    private fun auth(refreshOk: Boolean, calls: MutableList<String> = ArrayList()): SupabaseAuthClient {
        val engine = MockEngine { req ->
            calls.add(req.url.encodedPath + "?" + req.url.encodedQuery)
            if (req.url.encodedQuery.contains("refresh_token") && !refreshOk) respond("""{"error":"invalid_grant"}""", HttpStatusCode.BadRequest)
            else respond("""{"access_token":"new-at","refresh_token":"new-rt","expires_in":3600,"user":{"id":"u1"}}""", HttpStatusCode.OK)
        }
        return SupabaseAuthClient("https://x.supabase.co", "pk", engine) { now }
    }

    private fun valid() = SupabaseSession("at", "rt", now + 3600, "u1")
    private fun expired() = SupabaseSession("at", "rt", now - 10, "u1")

    @Test
    fun `restore with a valid stored session signs in without a network call`() = runTest {
        val calls = ArrayList<String>()
        val m = SessionManager(auth(true, calls), MemoryStore(valid())) { now }
        assertTrue(m.isRestoring.value)
        m.restore()
        assertFalse(m.isRestoring.value)
        assertEquals(AuthState.SignedIn(valid()), m.state.value)
        assertTrue(calls.isEmpty())
    }

    @Test
    fun `restore with an expired session refreshes and persists the new one`() = runTest {
        val store = MemoryStore(expired())
        val m = SessionManager(auth(true), store) { now }
        m.restore()
        assertEquals("new-at", (m.state.value as AuthState.SignedIn).session.accessToken)
        assertEquals("new-rt", store.session!!.refreshToken)
    }

    @Test
    fun `restore whose refresh fails clears the store and stays signed out`() = runTest {
        // Review Focus 4: never a signed-in shell that 401s forever.
        val store = MemoryStore(expired())
        val m = SessionManager(auth(false), store) { now }
        m.restore()
        assertEquals(AuthState.SignedOut, m.state.value)
        assertNull(store.session)
        assertFalse(m.isRestoring.value)
    }

    @Test
    fun `freshAccessToken refreshes at 59 seconds to expiry but not at 61`() = runTest {
        val calls = ArrayList<String>()
        val store = MemoryStore(SupabaseSession("at", "rt", now + 61, "u1"))
        val m = SessionManager(auth(true, calls), store) { now }
        m.restore()
        assertEquals("at", m.freshAccessToken())
        assertTrue(calls.isEmpty())
        store.session = SupabaseSession("at", "rt", now + 59, "u1")
        val m2 = SessionManager(auth(true, calls), store) { now }
        m2.restore() // 59s left is treated as expired at restore too, so it refreshes there
        assertEquals("new-at", m2.freshAccessToken())
        assertEquals(1, calls.size)
    }

    @Test
    fun `a forced refresh that fails signs out and returns null`() = runTest {
        val store = MemoryStore(valid())
        val m = SessionManager(auth(false), store) { now }
        m.restore()
        assertNull(m.freshAccessToken(force = true))
        assertEquals(AuthState.SignedOut, m.state.value)
        assertNull(store.session)
    }

    @Test
    fun `otp flow moves through awaiting code and persists the verified session`() = runTest {
        val store = MemoryStore()
        val m = SessionManager(auth(true), store) { now }
        m.requestCode(" a@b.c ")
        assertEquals(AuthState.AwaitingCode("a@b.c"), m.state.value)
        m.verifyCode("123456")
        assertTrue(m.state.value is AuthState.SignedIn)
        assertNotNull(store.session)
        assertNull(m.errorMessage.value)
    }

    @Test
    fun `a server rejection surfaces its message and keeps the state`() = runTest {
        val engine = MockEngine { respond("""{"msg":"Token has expired or is invalid"}""", HttpStatusCode.Forbidden) }
        val m = SessionManager(SupabaseAuthClient("https://x", "pk", engine) { now }, MemoryStore()) { now }
        m.requestCode("a@b.c")
        assertEquals("Token has expired or is invalid", m.errorMessage.value)
        assertEquals(AuthState.SignedOut, m.state.value)
        assertFalse(m.isBusy.value)
    }

    @Test
    fun `google sign-in exchanges the callback code with the remembered verifier`() = runTest {
        val bodies = ArrayList<String>()
        val engine = MockEngine { req ->
            bodies.add(req.body.toByteArray().decodeToString())
            respond("""{"access_token":"g-at","refresh_token":"g-rt","expires_in":3600,"user":{"id":"u9"}}""", HttpStatusCode.OK)
        }
        val m = SessionManager(SupabaseAuthClient("https://x.supabase.co", "pk", engine) { now }, MemoryStore()) { now }
        val url = m.beginGoogleSignIn("https://x.supabase.co", "com.obsidianmedia.learnwithalphonso://login-callback")
        assertTrue(url.startsWith("https://x.supabase.co/auth/v1/authorize?provider=google"))
        m.completeGoogleSignIn("com.obsidianmedia.learnwithalphonso://login-callback?code=abc")
        assertEquals("u9", m.userId)
        assertTrue(bodies.single().contains(""""auth_code":"abc""""))
        assertTrue(bodies.single().contains(""""code_verifier":""""))
    }

    @Test
    fun `a callback without a code is an error, not a crash`() = runTest {
        val m = SessionManager(auth(true), MemoryStore()) { now }
        m.beginGoogleSignIn("https://x", "cb://x")
        m.completeGoogleSignIn("cb://x?error=access_denied")
        assertEquals("Google sign-in didn't complete. Please try again.", m.errorMessage.value)
        assertEquals(AuthState.SignedOut, m.state.value)
    }

    /** An engine with no network at all: every request throws before reaching a server. */
    private fun offlineAuth(): SupabaseAuthClient =
        SupabaseAuthClient("https://x.supabase.co", "pk", MockEngine { throw IOException("no network") }) { now }

    @Test
    fun `restore offline with an expired session stays signed in on the stored session`() = runTest {
        // Review 2026-09-30, mirroring Session.swift's 2026-09-29 audit fix: only a rejected refresh token ends the session.
        val store = MemoryStore(expired())
        val m = SessionManager(offlineAuth(), store) { now }
        m.restore()
        assertEquals(AuthState.SignedIn(expired()), m.state.value)
        assertNotNull(store.session)
    }

    @Test
    fun `a forced refresh that cannot reach the server returns null but keeps the session`() = runTest {
        val store = MemoryStore(valid())
        val m = SessionManager(offlineAuth(), store) { now }
        m.restore()
        assertNull(m.freshAccessToken(force = true))
        assertTrue(m.state.value is AuthState.SignedIn)
        assertNotNull(store.session)
    }
}
