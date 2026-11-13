package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.logic.AiResponseReportReason
import com.obsidianmedia.learnwithalphonso.core.logic.AiReplyReports
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainDirection
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainRules
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
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.io.IOException

class ExplainClientTest {
    private data class Seen(val method: HttpMethod, val path: String, val auth: String?, val body: String)

    private fun client(
        seen: MutableList<Seen> = ArrayList(),
        status: HttpStatusCode = HttpStatusCode.OK,
        body: String = OK_BODY,
        failure: Throwable? = null,
    ): ExplainClient {
        val engine = MockEngine { req ->
            seen.add(Seen(req.method, req.url.encodedPath, req.headers["Authorization"], req.body.toByteArray().decodeToString()))
            if (failure != null) throw failure
            respond(body, status)
        }
        return ExplainClient(ApiHttp("https://learn.alphonsoecosystem.app", { "tok" }, engine))
    }

    private fun kindOf(block: suspend () -> Unit): ExplainErrorKind {
        var kind: ExplainErrorKind? = null
        try { kotlinx.coroutines.runBlocking { block() } } catch (e: ExplainException) { kind = e.kind }
        return kind!!
    }

    private val request = ExplainRules.wrongAnswer("q", "w", "c", "en")!!

    private companion object {
        const val OK_BODY = """{"explanation":"این یک توضیح است","language":"fa","direction":"rtl","cached":false}"""
    }

    @Test
    fun `explain posts the item to api explain with the bearer token and decodes the answer`() = runTest {
        val seen = ArrayList<Seen>()
        val result = client(seen).explain(request)
        val r = seen.single()
        assertEquals(HttpMethod.Post, r.method)
        assertEquals("/api/explain", r.path)
        assertEquals("Bearer tok", r.auth)
        assertEquals("wrong-answer", Json.parseToJsonElement(r.body).jsonObject["kind"]!!.jsonPrimitive.content)
        assertEquals("این یک توضیح است", result.explanation)
        assertEquals("fa", result.language)
        assertEquals(ExplainDirection.RTL, result.direction)
        assertEquals(false, result.cached)
    }

    @Test
    fun `an ltr answer decodes as ltr and a cached flag is kept`() = runTest {
        val r = client(body = """{"explanation":"Es una frase.","language":"es","direction":"ltr","cached":true}""").explain(request)
        assertEquals(ExplainDirection.LTR, r.direction)
        assertEquals(true, r.cached)
    }

    @Test
    fun `status codes map to error kinds`() {
        val cases = listOf(
            400 to ExplainErrorKind.UNSUPPORTED,
            422 to ExplainErrorKind.UNSUPPORTED,
            401 to ExplainErrorKind.NOT_SIGNED_IN,
            429 to ExplainErrorKind.QUOTA_EXCEEDED,
            500 to ExplainErrorKind.UNAVAILABLE,
            502 to ExplainErrorKind.UNAVAILABLE,
            503 to ExplainErrorKind.UNAVAILABLE,
        )
        for ((status, kind) in cases) assertEquals(kind, ExplainErrors.kindFor(status, null), "status $status")
    }

    @Test
    fun `a 403 is told apart by its body code`() {
        assertEquals(ExplainErrorKind.AI_CONSENT_REQUIRED, ExplainErrors.kindFor(403, "ai-consent-required"))
        assertEquals(ExplainErrorKind.NOT_ENTITLED, ExplainErrors.kindFor(403, "not-entitled"))
        assertEquals(ExplainErrorKind.NOT_ENTITLED, ExplainErrors.kindFor(403, null))
    }

    @Test
    fun `the client reads the 403 body to choose consent or pro`() {
        assertEquals(
            ExplainErrorKind.AI_CONSENT_REQUIRED,
            kindOf { client(status = HttpStatusCode.Forbidden, body = """{"error":"ai-consent-required"}""").explain(request) },
        )
        assertEquals(
            ExplainErrorKind.NOT_ENTITLED,
            kindOf { client(status = HttpStatusCode.Forbidden, body = """{"error":"not-entitled"}""").explain(request) },
        )
        assertEquals(
            ExplainErrorKind.QUOTA_EXCEEDED,
            kindOf { client(status = HttpStatusCode.TooManyRequests, body = """{"error":"quota-exceeded"}""").explain(request) },
        )
    }

    @Test
    fun `a transport failure is offline and a malformed answer is unavailable`() {
        assertEquals(ExplainErrorKind.OFFLINE, kindOf { client(failure = IOException("no route")).explain(request) })
        assertEquals(ExplainErrorKind.UNAVAILABLE, kindOf { client(body = "not json").explain(request) })
        assertEquals(ExplainErrorKind.UNAVAILABLE, kindOf { client(body = """{"explanation":"  ","language":"fa","direction":"rtl","cached":false}""").explain(request) })
        assertEquals(ExplainErrorKind.UNAVAILABLE, kindOf { client(body = """{"explanation":"x","language":"fa","direction":"sideways","cached":false}""").explain(request) })
        assertEquals(ExplainErrorKind.UNAVAILABLE, kindOf { client(body = """{"explanation":"x","language":"fa","direction":"rtl"}""").explain(request) })
    }

    @Test
    fun `every error kind has its own copy, word for word`() {
        assertEquals("Explaining needs a connection. Try again when you are back online.", ExplainErrors.copy(ExplainErrorKind.OFFLINE))
        assertEquals("You have used today's explanations. They come back tomorrow.", ExplainErrors.copy(ExplainErrorKind.QUOTA_EXCEEDED))
        assertEquals("AI features are turned off. Allow them to get explanations.", ExplainErrors.copy(ExplainErrorKind.AI_CONSENT_REQUIRED))
        assertEquals("Sign in again to get explanations.", ExplainErrors.copy(ExplainErrorKind.NOT_SIGNED_IN))
        assertEquals("Explanations in Hector need Hector Pro.", ExplainErrors.copy(ExplainErrorKind.NOT_ENTITLED))
        assertEquals("There is no explanation in your language for this one.", ExplainErrors.copy(ExplainErrorKind.UNSUPPORTED))
        assertEquals("Couldn't explain that. Try again.", ExplainErrors.copy(ExplainErrorKind.UNAVAILABLE))
        assertEquals(ExplainErrorKind.entries.size, ExplainErrorKind.entries.map { ExplainErrors.copy(it) }.toSet().size)
    }

    @Test
    fun `only offline and unavailable are worth a retry`() {
        assertEquals(
            setOf(ExplainErrorKind.OFFLINE, ExplainErrorKind.UNAVAILABLE),
            ExplainErrorKind.entries.filter { it.isRetryable }.toSet(),
        )
    }

    @Test
    fun `reporting an explanation uses the explain surface`() {
        val report = AiReplyReports.explain("این یک توضیح است", "en", AiResponseReportReason.INCORRECT)
        val context = report.toRow()["context"]!!.jsonObject
        assertEquals("explain", context["surface"]!!.jsonPrimitive.content)
        assertEquals("android", context["platform"]!!.jsonPrimitive.content)
        assertFalse(context.containsKey("scenario_id"))
        assertNotEquals("hector", context["surface"]!!.jsonPrimitive.content)
    }
}
