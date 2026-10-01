package com.obsidianmedia.learnwithalphonso.core.net

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ApiClientsTest {
    private data class Seen(val path: String, val auth: String?, val body: String)

    private fun http(seen: MutableList<Seen>, refresh: (suspend () -> String?)? = null, handler: (Seen) -> Pair<String, HttpStatusCode>): ApiHttp {
        val engine = MockEngine { req ->
            val s = Seen(req.url.encodedPath, req.headers["Authorization"], req.body.toByteArray().decodeToString())
            seen.add(s)
            val (body, status) = handler(s)
            respond(body, status)
        }
        return ApiHttp("https://learn.alphonsoecosystem.app", { "tok" }, engine, refresh)
    }

    @Test
    fun `export posts with the bearer token and returns the raw bytes`() = runTest {
        val seen = ArrayList<Seen>()
        val bytes = AccountClient(http(seen) { """{"profile":{}}""" to HttpStatusCode.OK }).exportMyData()
        assertEquals("""{"profile":{}}""", bytes.decodeToString())
        assertEquals("/api/account-export", seen.single().path)
        assertEquals("Bearer tok", seen.single().auth)
    }

    @Test
    fun `delete sends the literal confirmation and maps a failure`() = runTest {
        val seen = ArrayList<Seen>()
        AccountClient(http(seen) { """{"ok":true}""" to HttpStatusCode.OK }).deleteMyAccount()
        assertEquals("""{"confirm":"DELETE"}""", seen.single().body)
        val failing = AccountClient(http(ArrayList()) { """{"error":"Unauthorized"}""" to HttpStatusCode.Unauthorized })
        val error = runCatching { failing.deleteMyAccount() }.exceptionOrNull() as AccountError.Server
        assertEquals(401, error.status)
        assertEquals("Unauthorized", error.serverMessage)
    }

    @Test
    fun `a 401 is retried once with a refreshed token`() = runTest {
        val seen = ArrayList<Seen>()
        val h = http(seen, refresh = { "fresh" }) { s -> if (s.auth == "Bearer fresh") "{}" to HttpStatusCode.OK else "{}" to HttpStatusCode.Unauthorized }
        AccountClient(h).deleteMyAccount()
        assertEquals(listOf("Bearer tok", "Bearer fresh"), seen.map { it.auth })
    }

    @Test
    fun `translation grading returns the verdict and null on any failure`() = runTest {
        val seen = ArrayList<Seen>()
        val ok = TranslationGradingClient(http(seen) { """{"correct":true,"reason":"Fine.","source":"ai"}""" to HttpStatusCode.OK })
        assertEquals(TranslationVerdict(true, "Fine."), ok.gradeLessonTranslation("u1l1", "q5", "i do not get it", "en"))
        assertEquals("""{"lessonId":"u1l1","questionId":"q5","submission":"i do not get it","course":"en"}""", seen[0].body)
        ok.gradePlacementTranslation("p9", "x", "fr")
        assertEquals("""{"placementId":"p9","submission":"x","course":"fr"}""", seen[1].body)
        val down = TranslationGradingClient(http(ArrayList()) { """{"error":"quota"}""" to HttpStatusCode.TooManyRequests })
        assertNull(down.gradeLessonTranslation("u1l1", "q5", "x", "en"))
    }
}
