package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.logic.AiResponseReport
import com.obsidianmedia.learnwithalphonso.core.logic.AiResponseReportReason
import com.obsidianmedia.learnwithalphonso.core.logic.AiResponseSurface
import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class AiResponseReportClientTest {
    private val report = AiResponseReport("Bad reply", AiResponseSurface.HECTOR, "en", AiResponseReportReason.INCORRECT)

    @Test
    fun `a report is a plain insert into content_reports with return=minimal`() = runTest {
        val fake = FakeSupabase { json("", HttpStatusCode.Created) }
        ProgressSyncClient(fake.http).reportAiResponse(report)
        val req = fake.seen.single()
        assertEquals("POST", req.method)
        assertEquals("/rest/v1/content_reports", req.path)
        assertEquals("return=minimal", req.headers["Prefer"])
        assertEquals("""{"kind":"ai_response","reason":"ai_incorrect","context":{"message":"Bad reply","surface":"hector","course":"en","platform":"android"}}""", req.body)
    }

    @Test
    fun `a refused insert is thrown so the learner is told it failed`() = runTest {
        val fake = FakeSupabase { json("""{"message":"new row violates row-level security policy"}""", HttpStatusCode.Forbidden) }
        assertThrows(ProgressSyncError.Server::class.java) { kotlinx.coroutines.runBlocking { ProgressSyncClient(fake.http).reportAiResponse(report) } }
    }
}
