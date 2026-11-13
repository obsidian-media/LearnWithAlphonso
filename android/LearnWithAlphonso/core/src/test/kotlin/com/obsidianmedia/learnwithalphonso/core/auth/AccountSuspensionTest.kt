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
        "This account is suspended. If you think this is a mistake, contact support at support@alphonsoecosystem.app."

    private class MemoryStore(var session: SupabaseSession? = null) : SessionStore {
        override fun load() = session
        override fun save(session: SupabaseSession) { this.session = session }
        override fun clear() { session = null }
    }

    @Test
    fun `the copy is plain and names the support address`() {
        assertEquals("This account is suspended.", AccountSuspension.TITLE)
        assertEquals("If you think this is a mistake, contact support at support@alphonsoecosystem.app.", AccountSuspension.BODY)
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
}
