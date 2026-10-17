package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.logic.AiResponseReport
import io.ktor.http.HttpMethod

/**
 * Plain insert into `content_reports` (RLS `content_reports_insert_own`), the same trust boundary as reporting a
 * user. Throws [ProgressSyncError.Server] on a non-2xx answer; the caller shows `AiConsentCopy.reportFailed`.
 */
suspend fun ProgressSyncClient.reportAiResponse(report: AiResponseReport) {
    http.requireSuccess(http.rest(HttpMethod.Post, "content_reports", body = report.toRow(), headers = mapOf("Prefer" to "return=minimal")))
}
