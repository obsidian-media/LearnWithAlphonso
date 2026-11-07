package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.firstrun.LearnerAnswers
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.io.IOException

class LearnerProfileClientTest {
    private data class Seen(val method: HttpMethod, val path: String, val auth: String?, val body: String)

    private fun client(
        seen: MutableList<Seen> = ArrayList(),
        status: HttpStatusCode = HttpStatusCode.OK,
        body: String = """{"profile":{}}""",
        failure: Throwable? = null,
    ): LearnerProfileClient {
        val engine = MockEngine { req ->
            seen.add(Seen(req.method, req.url.encodedPath, req.headers["Authorization"], req.body.toByteArray().decodeToString()))
            if (failure != null) throw failure
            respond(body, status)
        }
        return LearnerProfileClient(ApiHttp("https://learn.alphonsoecosystem.app", { "tok" }, engine))
    }

    @Test
    fun `save is a PUT of the patch and the mark with the bearer token`() = runTest {
        val seen = ArrayList<Seen>()
        val saved = client(seen, body = """{"profile":{"goal":"travel","completedAt":"2026-11-06T10:00:00.000Z"}}""")
            .save(LearnerAnswers(goal = "travel", dailyMinutes = 10), LearnerProfileClient.Mark.COMPLETED)
        val r = seen.single()
        assertEquals(HttpMethod.Put, r.method)
        assertEquals("/api/learner-profile", r.path)
        assertEquals("Bearer tok", r.auth)
        val body = Json.parseToJsonElement(r.body).jsonObject
        assertEquals("completed", body["mark"]!!.jsonPrimitive.content)
        assertEquals(setOf("goal", "dailyMinutes"), body["patch"]!!.jsonObject.keys)
        assertEquals("travel", saved.answers.goal)
        assertFalse(saved.needsCompleteProfile)
    }

    @Test
    fun `not now sends an empty patch and the dismissed mark`() = runTest {
        val seen = ArrayList<Seen>()
        client(seen).save(LearnerAnswers(), LearnerProfileClient.Mark.DISMISSED)
        val body = Json.parseToJsonElement(seen.single().body).jsonObject
        assertEquals(0, body["patch"]!!.jsonObject.size)
        assertEquals("dismissed", body["mark"]!!.jsonPrimitive.content)
    }

    @Test
    fun `fetch reads the profile`() = runTest {
        val p = client(body = """{"profile":{"goal":"exam","showFlag":true}}""").fetch()
        assertEquals("exam", p.answers.goal)
        assertEquals(true, p.answers.showFlag)
    }

    @Test
    fun `failures map to their errors`() {
        assertThrows(LearnerProfileError.Invalid::class.java) { kotlinx.coroutines.runBlocking { client(status = HttpStatusCode.BadRequest).fetch() } }
        assertThrows(LearnerProfileError.NotSignedIn::class.java) { kotlinx.coroutines.runBlocking { client(status = HttpStatusCode.Unauthorized).fetch() } }
        assertThrows(LearnerProfileError.Offline::class.java) { kotlinx.coroutines.runBlocking { client(failure = IOException("down")).fetch() } }
        val failed = assertThrows(LearnerProfileError.Failed::class.java) {
            kotlinx.coroutines.runBlocking { client(status = HttpStatusCode.InternalServerError, body = """{"error":"Couldn't save your answers. Try again."}""").fetch() }
        }
        assertEquals("Couldn't save your answers. Try again.", failed.serverMessage)
    }
}
