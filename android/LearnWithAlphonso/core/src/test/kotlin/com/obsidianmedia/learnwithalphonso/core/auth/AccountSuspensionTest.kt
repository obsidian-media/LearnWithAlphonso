package com.obsidianmedia.learnwithalphonso.core.auth

import com.obsidianmedia.learnwithalphonso.core.net.SupabaseAuthClient
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseAuthError
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseSession
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AccountSuspensionTest {
    private val now = 1_758_000_000L
    private val expectedMessage =
        "This account is suspended. If you think this is a mistake, contact support at support@learnwithalphonso.com."

    private class MemoryStore(var session: SupabaseSession? = null) : SessionStore {
        override fun load() = session
        override fun save(session: SupabaseSession) { this.session = session }
        override fun clear() { session = null }
    }

    @Test
    fun `the copy is plain and names the support address`() {
        assertEquals("This account is suspended.", AccountSuspension.TITLE)
        assertEquals("If you think this is a mistake, contact support at support@learnwithalphonso.com.", AccountSuspension.BODY)
        assertEquals(expectedMessage, AccountSuspension.MESSAGE)
    }

    @Test
    fun `user_banned and account_suspended are suspensions, nothing else is`() {
        assertTrue(AccountSuspension.isSuspended(SupabaseAuthError.Server(400, "User is banned")))
        assertTrue(AccountSuspension.isSuspended(SupabaseAuthError.Server(403, "account_suspended")))
        assertFalse(AccountSuspension.isSuspended(SupabaseAuthError.Server(400, "Token has expired or is invalid")))
        assertFalse(AccountSuspension.isSuspended(SupabaseAuthError.Server(429, null)))
        assertFalse(AccountSuspension.isSuspended(SupabaseAuthError.InvalidPayload()))
        assertFalse(AccountSuspension.isSuspended(java.io.IOException("offline")))
    }

    @Test
    fun `a banned sign-in shows the suspended message, not the raw error`() = runTest {
        val engine = MockEngine { respond("""{"msg":"User is banned","error_code":"user_banned"}""", HttpStatusCode.BadRequest) }
        val m = SessionManager(SupabaseAuthClient("https://x", "pk", engine) { now }, MemoryStore()) { now }
        m.requestCode("a@b.c")
        assertEquals(expectedMessage, m.errorMessage.value)
    }

    @Test
    fun `a refresh refused because the account is banned signs out with the suspended message`() = runTest {
        val engine = MockEngine { respond("""{"msg":"User is banned","error_code":"user_banned"}""", HttpStatusCode.BadRequest) }
        val store = MemoryStore(SupabaseSession("at", "rt", now + 3600, "u1"))
        val m = SessionManager(SupabaseAuthClient("https://x", "pk", engine) { now }, store) { now }
        m.restore()
        assertNull(m.freshAccessToken(force = true))
        assertEquals(AuthState.SignedOut, m.state.value)
        assertEquals(expectedMessage, m.errorMessage.value)
    }

    @Test
    fun `an ordinary rejected refresh still signs out with no message`() = runTest {
        val engine = MockEngine { respond("""{"error":"invalid_grant"}""", HttpStatusCode.BadRequest) }
        val store = MemoryStore(SupabaseSession("at", "rt", now + 3600, "u1"))
        val m = SessionManager(SupabaseAuthClient("https://x", "pk", engine) { now }, store) { now }
        m.restore()
        assertNull(m.freshAccessToken(force = true))
        assertNull(m.errorMessage.value)
    }

    @Test
    fun `a banned sign-in raises the full-screen flag and signing out of it clears everything`() = runTest {
        val engine = MockEngine { respond("""{"msg":"User is banned","error_code":"user_banned"}""", HttpStatusCode.BadRequest) }
        val m = SessionManager(SupabaseAuthClient("https://x", "pk", engine) { now }, MemoryStore()) { now }
        assertFalse(m.suspended.value)
        m.requestCode("a@b.c")
        assertTrue(m.suspended.value)
        m.dismissSuspension()
        assertFalse(m.suspended.value)
        assertNull(m.errorMessage.value)
    }

    @Test
    fun `a banned refresh at launch or later raises the flag, an ordinary rejection does not`() = runTest {
        val banned = MockEngine { respond("""{"msg":"User is banned","error_code":"user_banned"}""", HttpStatusCode.BadRequest) }
        val launch = SessionManager(SupabaseAuthClient("https://x", "pk", banned) { now }, MemoryStore(SupabaseSession("at", "rt", now - 10, "u1"))) { now }
        launch.restore()
        assertTrue(launch.suspended.value, "found at cold launch")

        val later = SessionManager(SupabaseAuthClient("https://x", "pk", banned) { now }, MemoryStore(SupabaseSession("at", "rt", now + 3600, "u1"))) { now }
        later.restore()
        later.freshAccessToken(force = true)
        assertTrue(later.suspended.value, "found by a later refresh")

        val plain = MockEngine { respond("""{"error":"invalid_grant"}""", HttpStatusCode.BadRequest) }
        val ordinary = SessionManager(SupabaseAuthClient("https://x", "pk", plain) { now }, MemoryStore(SupabaseSession("at", "rt", now - 10, "u1"))) { now }
        ordinary.restore()
        assertFalse(ordinary.suspended.value)
    }

    @Test
    fun `the full-screen labels name the action and the address, and a blank reason is none`() {
        assertEquals("mailto:support@learnwithalphonso.com", AccountSuspension.CONTACT_URL)
        assertTrue(AccountSuspension.CONTACT_LABEL.contains("support@learnwithalphonso.com"))
        assertTrue(AccountSuspension.SIGN_OUT_LABEL.startsWith("Sign out"))
        assertEquals("Repeated abuse of chat", AccountSuspension.reasonLine("  Repeated abuse of chat "))
        assertNull(AccountSuspension.reasonLine("   "))
        assertNull(AccountSuspension.reasonLine(null))
    }
}
