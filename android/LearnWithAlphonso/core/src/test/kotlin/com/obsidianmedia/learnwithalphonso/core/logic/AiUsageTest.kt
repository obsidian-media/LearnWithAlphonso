package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.net.AiUsageClient
import com.obsidianmedia.learnwithalphonso.core.net.ApiHttp
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException

/** The same cases as src/lib/ai-usage-view.test.ts and AiUsageTests.swift: the states, the clamp, hide-on-unknown, the reset date, no dollars. */
class AiUsageTest {
    private val reset = "2026-12-01T00:00:00.000Z"

    private fun view(state: String, percent: String, resetsAt: String = reset) =
        AiUsage.parse("""{"state":"$state","percentUsed":$percent,"resetsAt":"$resetsAt"}""")

    @Test
    fun `each known state gets its word and the percent is clamped`() {
        val ok = view("ok", "37")!!
        assertEquals(37, ok.percent)
        assertEquals("Plenty left", ok.label)
        assertEquals("Resets on 1 December", ok.resetLine)
        assertEquals("37 percent used, plenty left", ok.valueText)
        assertEquals("Getting close", view("warn", "85")!!.label)
        assertEquals(100, view("ok", "250")!!.percent)
        assertEquals(0, view("ok", "-4")!!.percent)
        assertEquals(37, view("ok", "37.9")!!.percent)
    }

    @Test
    fun `a capped learner is always at the end of the meter`() {
        val v = view("capped", "0")!!
        assertEquals(100, v.percent)
        assertEquals("Limit reached", v.label)
    }

    @Test
    fun `unknown and anything malformed is null so the card draws nothing`() {
        val bad = listOf(
            """{"state":"unknown","percentUsed":0,"resetsAt":"$reset"}""",
            """{"state":"okay","percentUsed":10,"resetsAt":"$reset"}""",
            """{"state":"ok","percentUsed":"10","resetsAt":"$reset"}""",
            """{"state":"ok"}""", """{"error":"x"}""", "null", "\"ok\"", "42", "not json", "",
            """{"state":ok,"percentUsed":1}""",
        )
        for (b in bad) assertNull(AiUsage.parse(b), b)
    }

    @Test
    fun `the reset line uses the UTC day and falls back when the instant is unreadable`() {
        assertEquals("1 December", AiUsage.resetDateLabel("2026-12-01T00:00:00Z"))
        assertEquals("1 January", AiUsage.resetDateLabel("2027-01-01T00:00:00.000Z"))
        assertEquals("31 March", AiUsage.resetDateLabel("2026-03-31T23:59:59.999Z"))
        assertNull(AiUsage.resetDateLabel("soon"))
        assertEquals("Resets at the start of next month", view("ok", "1", "soon")!!.resetLine)
        assertEquals("Resets at the start of next month", AiUsage.parse("""{"state":"ok","percentUsed":1}""")!!.resetLine)
    }

    @Test
    fun `the note says lessons still work only when not ok`() {
        assertFalse(view("ok", "1")!!.summary.contains("Lessons and review always work."))
        assertTrue(view("warn", "90")!!.summary.contains("Lessons and review always work."))
        assertEquals(
            "AI practice is paused for now. Lessons and review always work. Resets on 1 December.",
            view("capped", "100")!!.summary,
        )
    }

    @Test
    fun `no dollars or money words anywhere in what the learner sees`() {
        val shown = mutableListOf(AiUsageCopy.TITLE, AiUsageCopy.EXPLAIN, AiUsageCopy.STILL_WORKS, AiUsageCopy.RESET_FALLBACK)
        for (state in listOf("ok", "warn", "capped")) {
            // Even if a future route sent a dollar field, the view has nowhere to carry it.
            val v = AiUsage.parse("""{"state":"$state","percentUsed":50,"costUsd":4.2,"capUsd":5,"resetsAt":"$reset"}""")!!
            shown += listOf(v.label, v.message, v.valueText, v.resetLine, v.summary)
        }
        val money = Regex("""[$€£]|\bdollar|\bUSD\b|\bcost\b|\bprice\b""", RegexOption.IGNORE_CASE)
        for (text in shown) assertFalse(money.containsMatchIn(text), text)
    }

    private fun client(status: HttpStatusCode = HttpStatusCode.OK, body: String = "", failure: Throwable? = null, seen: MutableList<Pair<String, String?>> = ArrayList()): AiUsageClient {
        val engine = MockEngine { req ->
            seen.add(req.url.encodedPath to req.headers["Authorization"])
            if (failure != null) throw failure
            respond(body, status)
        }
        return AiUsageClient(ApiHttp("https://learn.alphonsoecosystem.app", { "tok" }, engine))
    }

    @Test
    fun `the client reads the route with the bearer token`() = runTest {
        val seen = ArrayList<Pair<String, String?>>()
        val v = client(body = """{"state":"warn","percentUsed":90,"resetsAt":"$reset"}""", seen = seen).fetch()
        assertEquals("/api/ai-usage" to "Bearer tok", seen.single())
        assertNotNull(v)
        assertEquals(AiUsageState.WARN, v!!.state)
    }

    @Test
    fun `any failure or an unknown state is null`() = runTest {
        assertNull(client(status = HttpStatusCode.InternalServerError, body = """{"state":"ok","percentUsed":1}""").fetch())
        assertNull(client(status = HttpStatusCode.Unauthorized, body = "{}").fetch())
        assertNull(client(failure = IOException("offline")).fetch())
        assertNull(client(body = """{"state":"unknown","percentUsed":0}""").fetch())
        assertNull(client(body = "<html>").fetch())
    }
}
