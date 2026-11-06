package com.obsidianmedia.learnwithalphonso.core.net

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.io.IOException

class SubscriptionLoginTest {
    private val account = "00000000-0000-4000-8000-000000000001"
    private val sub = "sub_0123456789abcdef0123456789abcdef"
    private val base = "https://learn.example"

    private fun answer(status: HttpStatusCode, json: String) = MockEngine { respond(json, status) }

    @Test
    fun `logs in with the server's subscription identifier, or the account id when the server says so`() = runTest {
        assertEquals(sub, SubscriptionLogin.resolve(base, account, "t", answer(HttpStatusCode.OK, """{"appUserId":"$sub"}""")))
        assertEquals(account, SubscriptionLogin.resolve(base, account, "t", answer(HttpStatusCode.OK, """{"appUserId":"$account"}""")))
    }

    @Test
    fun `any failure falls back to the account id`() = runTest {
        assertEquals(account, SubscriptionLogin.resolve(base, account, "t", answer(HttpStatusCode.ServiceUnavailable, """{"error":"x"}""")))
        assertEquals(account, SubscriptionLogin.resolve(base, account, "t", MockEngine { throw IOException("offline") }))
        assertEquals(account, SubscriptionLogin.resolve(base, account, null, answer(HttpStatusCode.OK, """{"appUserId":"$sub"}""")))
        assertEquals(account, SubscriptionLogin.resolve(base, account, "t", answer(HttpStatusCode.OK, "<html>")))
    }

    @Test
    fun `never uses an unexpected id`() = runTest {
        for (bad in listOf("someone-else", "sub_XYZ", "sub_0123", "\$RCAnonymousID:abc", "")) {
            assertEquals(account, SubscriptionLogin.resolve(base, account, "t", answer(HttpStatusCode.OK, """{"appUserId":"$bad"}""")), bad)
        }
    }

    @Test
    fun `sends the session to the subscription-login route`() = runTest {
        var url: String? = null
        var auth: String? = null
        val engine = MockEngine { req ->
            url = req.url.toString()
            auth = req.headers["Authorization"]
            respond("{}", HttpStatusCode.NotFound)
        }
        SubscriptionLogin.resolve("$base/", account, "tok", engine)
        assertEquals("https://learn.example/api/subscription-login", url)
        assertEquals("Bearer tok", auth)
    }
}
