package com.obsidianmedia.learnwithalphonso.core.net

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** GET, PUT and DELETE on ApiHttp, added for /api/learning-goal (post was the only verb before). */
class ApiHttpTest {
    private data class Seen(val method: HttpMethod, val path: String, val query: String, val auth: String?, val contentType: String?, val body: String)

    private fun http(
        seen: MutableList<Seen>,
        refresh: (suspend () -> String?)? = null,
        statuses: MutableList<HttpStatusCode> = mutableListOf(),
    ): ApiHttp {
        val engine = MockEngine { req ->
            seen.add(
                Seen(
                    req.method, req.url.encodedPath, req.url.encodedQuery, req.headers["Authorization"],
                    req.body.contentType?.toString(), req.body.toByteArray().decodeToString(),
                ),
            )
            respond("""{"ok":true}""", statuses.removeFirstOrNull() ?: HttpStatusCode.OK)
        }
        return ApiHttp("https://learn.alphonsoecosystem.app/", { "tok" }, engine, refresh)
    }

    @Test
    fun `get sends a GET with the encoded query in order, the bearer token and no body`() = runTest {
        val seen = ArrayList<Seen>()
        http(seen).get("api/learning-goal", linkedMapOf("course" to "en", "targetLevel" to "B1", "targetDate" to "2026-12-01"))
        val r = seen.single()
        assertEquals(HttpMethod.Get, r.method)
        assertEquals("/api/learning-goal", r.path)
        assertEquals("course=en&targetLevel=B1&targetDate=2026-12-01", r.query)
        assertEquals("Bearer tok", r.auth)
        assertEquals("", r.body)
    }

    @Test
    fun `get encodes characters that need it`() = runTest {
        val seen = ArrayList<Seen>()
        http(seen).get("api/x", mapOf("q" to "a b&c"))
        assertEquals("q=a+b%26c", seen.single().query.replace("%20", "+"))
    }

    @Test
    fun `put sends a PUT with the JSON body`() = runTest {
        val seen = ArrayList<Seen>()
        http(seen).put("api/learning-goal", buildJsonObject { put("course", "en") })
        val r = seen.single()
        assertEquals(HttpMethod.Put, r.method)
        assertEquals("""{"course":"en"}""", r.body)
        assertTrue(r.contentType!!.startsWith("application/json"))
        assertEquals("Bearer tok", r.auth)
    }

    @Test
    fun `delete sends a DELETE with the query and no body`() = runTest {
        val seen = ArrayList<Seen>()
        http(seen).delete("api/learning-goal", mapOf("course" to "es"))
        val r = seen.single()
        assertEquals(HttpMethod.Delete, r.method)
        assertEquals("course=es", r.query)
        assertEquals("", r.body)
    }

    @Test
    fun `each new verb retries once on a 401 with the refreshed token`() = runTest {
        for (call in listOf<suspend (ApiHttp) -> Unit>(
            { it.get("api/x", mapOf("a" to "1")) },
            { it.put("api/x", buildJsonObject { put("a", "1") }) },
            { it.delete("api/x", mapOf("a" to "1")) },
        )) {
            val seen = ArrayList<Seen>()
            val http = http(seen, refresh = { "fresh" }, statuses = mutableListOf(HttpStatusCode.Unauthorized, HttpStatusCode.OK))
            call(http)
            assertEquals(listOf("Bearer tok", "Bearer fresh"), seen.map { it.auth })
        }
    }

    @Test
    fun `a refreshed token that is still rejected is returned after exactly two requests`() = runTest {
        val seen = ArrayList<Seen>()
        val http = http(seen, refresh = { "fresh" }, statuses = mutableListOf(HttpStatusCode.Unauthorized, HttpStatusCode.Unauthorized))
        val response = http.get("api/x")
        assertEquals(HttpStatusCode.Unauthorized, response.status)
        assertEquals(2, seen.size)
    }

    @Test
    fun `without a refresh a 401 is returned after one request`() = runTest {
        val seen = ArrayList<Seen>()
        val response = http(seen, statuses = mutableListOf(HttpStatusCode.Unauthorized)).delete("api/x")
        assertEquals(HttpStatusCode.Unauthorized, response.status)
        assertEquals(1, seen.size)
    }
}
