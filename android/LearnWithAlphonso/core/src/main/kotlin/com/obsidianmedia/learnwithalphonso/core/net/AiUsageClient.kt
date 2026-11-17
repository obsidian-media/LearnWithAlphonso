package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.logic.AiUsage
import com.obsidianmedia.learnwithalphonso.core.logic.AiUsageView
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.CancellationException

/**
 * One read of `GET /api/ai-usage` (src/routes/api/ai-usage.ts) with the app's bearer token (ApiHttp refreshes once on a
 * 401). Never throws, except a cancellation: any failure, a non-200 or an unknown state is null and the Settings card
 * draws nothing.
 */
class AiUsageClient(private val http: ApiHttp) {
    suspend fun fetch(): AiUsageView? = try {
        val response = http.get(PATH)
        if (response.status.value == 200) AiUsage.parse(response.bodyAsText()) else null
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        null
    }

    private companion object {
        const val PATH = "api/ai-usage"
    }
}
