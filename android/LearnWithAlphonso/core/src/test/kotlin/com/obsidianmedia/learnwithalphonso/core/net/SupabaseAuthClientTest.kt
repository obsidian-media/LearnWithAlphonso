package com.obsidianmedia.learnwithalphonso.core.net

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SupabaseAuthClientTest {
    private val sessionJson = """{"access_token":"at","refresh_token":"rt","expires_in":3600,"user":{"id":"u1"}}"""
    private val now = 1_758_000_000L

    private fun engine(handler: (path: String, query: String, body: String, apikey: String?) -> Pair<String, HttpStatusCode>) = MockEngine { req ->
        val (body, status) = handler(req.url.encodedPath, req.url.encodedQuery, req.body.toByteArray().decodeToString(), req.headers["apikey"])
        respond(body, status)
    }

    @Test
    fun `otp request and verify hit GoTrue with the publishable key`() = runTest {
        val seen = ArrayList<String>()
        val client = SupabaseAuthClient("https://x.supabase.co", "pk", engine { p, q, b, k -> seen.add("$p?$q $b $k"); sessionJson to HttpStatusCode.OK }) { now }
        client.requestEmailOtp("a@b.c")
        val session = client.verifyEmailOtp("a@b.c", "123456")
        assertEquals(SupabaseSession("at", "rt", now + 3600, "u1"), session)
        assertEquals("""/auth/v1/otp? {"email":"a@b.c","create_user":true} pk""", seen[0])
        assertEquals("""/auth/v1/verify? {"email":"a@b.c","token":"123456","type":"email"} pk""", seen[1])
    }

    @Test
    fun `password sign-in, pkce exchange and refresh use the token endpoint grant types`() = runTest {
        val seen = ArrayList<String>()
        val client = SupabaseAuthClient("https://x.supabase.co", "pk", engine { p, q, b, _ -> seen.add("$p?$q $b"); """{"access_token":"at","refresh_token":"rt","expires_at":1234,"user":{"id":"u1"}}""" to HttpStatusCode.OK }) { now }
        assertEquals(1234L, client.signInWithPassword("a@b.c", "pw").expiresAtEpochSeconds)
        client.exchangeOAuthCode("code1", "ver1")
        client.refresh(SupabaseSession("old", "rt-old", 0, "u1"))
        assertEquals("""/auth/v1/token?grant_type=password {"email":"a@b.c","password":"pw"}""", seen[0])
        assertEquals("""/auth/v1/token?grant_type=pkce {"auth_code":"code1","code_verifier":"ver1"}""", seen[1])
        assertEquals("""/auth/v1/token?grant_type=refresh_token {"refresh_token":"rt-old"}""", seen[2])
    }

    @Test
    fun `sign-up returns null while email confirmation is pending and a session otherwise`() = runTest {
        var pending = true
        val seen = ArrayList<String>()
        val client = SupabaseAuthClient("https://x.supabase.co", "pk", engine { p, q, b, _ ->
            seen.add("$p?$q $b")
            (if (pending) """{"id":"u1","email":"a@b.c"}""" else sessionJson) to HttpStatusCode.OK
        }) { now }
        assertNull(client.signUpWithPassword("a@b.c", "pw", "Ana", "https://learn.alphonsoecosystem.app/placement"))
        assertTrue(seen[0].startsWith("/auth/v1/signup?redirect_to=https%3A%2F%2Flearn.alphonsoecosystem.app%2Fplacement"))
        assertTrue(seen[0].contains(""""data":{"display_name":"Ana"}"""))
        pending = false
        assertEquals("u1", client.signUpWithPassword("a@b.c", "pw", "Ana", "x")!!.userId)
    }

    @Test
    fun `server errors carry GoTrue's message`() = runTest {
        val client = SupabaseAuthClient("https://x.supabase.co", "pk", engine { _, _, _, _ -> """{"error_description":"Invalid login credentials"}""" to HttpStatusCode.BadRequest }) { now }
        val error = runCatching { client.signInWithPassword("a", "b") }.exceptionOrNull() as SupabaseAuthError.Server
        assertEquals(400, error.status)
        assertEquals("Invalid login credentials", error.serverMessage)
    }

    @Test
    fun `pkce challenge is the base64url sha256 of the verifier and the authorize url matches iOS`() {
        // RFC 7636 appendix B vector.
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", OAuthPkce.challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
        val c = PkceChallenge("v", "ch")
        assertEquals(
            "https://x.supabase.co/auth/v1/authorize?provider=google&redirect_to=com.obsidianmedia.learnwithalphonso%3A%2F%2Flogin-callback&code_challenge=ch&code_challenge_method=s256",
            OAuthPkce.authorizeUrl("https://x.supabase.co", "com.obsidianmedia.learnwithalphonso://login-callback", c),
        )
        assertEquals("abc", OAuthPkce.authorizationCode("com.obsidianmedia.learnwithalphonso://login-callback?code=abc&state=x"))
        assertNull(OAuthPkce.authorizationCode("com.obsidianmedia.learnwithalphonso://login-callback?error=denied"))
        assertTrue(OAuthPkce.make().verifier.length >= 43)
    }
}
