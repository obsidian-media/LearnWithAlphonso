package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.goal.GoalStatus
import com.obsidianmedia.learnwithalphonso.core.goal.LearningGoalError
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException

class LearningGoalClientTest {
    private data class Seen(val method: HttpMethod, val path: String, val query: String, val auth: String?, val body: String)

    private val plan = """{"currentLevel":"A1","targetLevel":"B1","targetDate":"2026-12-01","lessonsInScope":30,"lessonsRemaining":20,
        "lessonsDoneLast7Days":10,"requiredPerWeek":10,"status":"on_track","realism":"ok","suggestedDate":null,"asOf":"2026-10-06T12:00:00.000Z"}"""
    private val goal = """{"course":"en","targetLevel":"B1","targetDate":"2026-12-01","createdAt":"2026-10-01T00:00:00.000Z"}"""

    private fun client(
        seen: MutableList<Seen> = ArrayList(),
        status: HttpStatusCode = HttpStatusCode.OK,
        body: String = """{"goal":null,"plan":null}""",
        failure: Throwable? = null,
    ): LearningGoalClient {
        val engine = MockEngine { req ->
            seen.add(Seen(req.method, req.url.encodedPath, req.url.encodedQuery, req.headers["Authorization"], req.body.toByteArray().decodeToString()))
            if (failure != null) throw failure
            respond(body, status)
        }
        return LearningGoalClient(ApiHttp("https://learn.alphonsoecosystem.app", { "tok" }, engine))
    }

    @Test
    fun `fetch gets the course with the bearer token and decodes the state`() = runTest {
        val seen = ArrayList<Seen>()
        val state = client(seen, body = """{"goal":$goal,"plan":$plan}""").fetch("en")
        val r = seen.single()
        assertEquals(HttpMethod.Get, r.method)
        assertEquals("/api/learning-goal", r.path)
        assertEquals("course=en", r.query)
        assertEquals("Bearer tok", r.auth)
        assertEquals("B1", state.goal!!.targetLevel)
        assertEquals(GoalStatus.ON_TRACK, state.plan!!.status)
    }

    @Test
    fun `fetch with no goal is an empty state`() = runTest {
        val state = client().fetch("fr")
        assertNull(state.goal)
        assertNull(state.plan)
    }

    @Test
    fun `preview is a GET with the candidate in the query and no body`() = runTest {
        val seen = ArrayList<Seen>()
        val result = client(seen, body = """{"plan":$plan}""").preview("en", "B1", "2026-12-01")
        val r = seen.single()
        assertEquals(HttpMethod.Get, r.method)
        assertEquals("course=en&targetLevel=B1&targetDate=2026-12-01", r.query)
        assertEquals("", r.body)
        assertEquals(10, result.requiredPerWeek)
    }

    @Test
    fun `save puts exactly the course, level and date as JSON`() = runTest {
        val seen = ArrayList<Seen>()
        val state = client(seen, body = """{"goal":$goal,"plan":$plan}""").save("en", "B1", "2026-12-01")
        val r = seen.single()
        assertEquals(HttpMethod.Put, r.method)
        assertEquals("""{"course":"en","targetLevel":"B1","targetDate":"2026-12-01"}""", r.body)
        assertNotNull(state.goal)
    }

    @Test
    fun `remove is a DELETE for the course`() = runTest {
        val seen = ArrayList<Seen>()
        client(seen, body = """{"ok":true}""").remove("es")
        assertEquals(HttpMethod.Delete, seen.single().method)
        assertEquals("course=es", seen.single().query)
    }

    @Test
    fun `a 400 carries the servers reason, or none when unreadable`() = runTest {
        val withReason = assertThrows(LearningGoalError.Invalid::class.java) {
            kotlinx.coroutines.runBlocking { client(status = HttpStatusCode.BadRequest, body = """{"error":"That level is below yours"}""").fetch("en") }
        }
        assertEquals("That level is below yours", withReason.detail)
        val without = assertThrows(LearningGoalError.Invalid::class.java) {
            kotlinx.coroutines.runBlocking { client(status = HttpStatusCode.BadRequest, body = "nope").fetch("en") }
        }
        assertNull(without.detail)
    }

    @Test
    fun `statuses map to the same errors as the web and iOS clients`() = runTest {
        for ((status, expected) in listOf(
            HttpStatusCode.Unauthorized to LearningGoalError.NotSignedIn,
            HttpStatusCode.Forbidden to LearningGoalError.NotSignedIn,
            HttpStatusCode.InternalServerError to LearningGoalError.Unavailable,
            HttpStatusCode.BadGateway to LearningGoalError.Unavailable,
        )) {
            val error = runCatching { client(status = status, body = """{"error":"x"}""").fetch("en") }.exceptionOrNull()
            assertEquals(expected, error, "HTTP ${status.value}")
        }
    }

    @Test
    fun `an IOException is offline and any other failure is unavailable`() = runTest {
        assertEquals(LearningGoalError.Offline, runCatching { client(failure = IOException("no route")).fetch("en") }.exceptionOrNull())
        assertEquals(LearningGoalError.Unavailable, runCatching { client(failure = IllegalStateException("boom")).fetch("en") }.exceptionOrNull())
    }

    @Test
    fun `a cancellation is rethrown, never shown as offline or an error`() = runTest {
        val error = runCatching { client(failure = CancellationException("screen left")).fetch("en") }.exceptionOrNull()
        assertTrue(error is CancellationException, "was $error")
    }

    @Test
    fun `a 200 with the wrong shape is unavailable`() = runTest {
        val error = runCatching { client(body = """{"goal":$goal,"plan":{"nope":1}}""").fetch("en") }.exceptionOrNull()
        assertEquals(LearningGoalError.Unavailable, error)
    }
}
