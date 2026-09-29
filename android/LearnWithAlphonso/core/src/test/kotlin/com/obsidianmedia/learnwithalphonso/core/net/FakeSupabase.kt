package com.obsidianmedia.learnwithalphonso.core.net

import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.MockRequestHandleScope
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.toByteArray
import io.ktor.client.request.HttpRequestData
import io.ktor.client.request.HttpResponseData
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf

/** One request the fake server saw, decoded for assertions. */
data class SeenRequest(
    val method: String,
    val path: String,
    val query: Map<String, String>,
    val headers: Map<String, String>,
    val body: String,
    val queryEntries: List<Pair<String, String>> = emptyList(),
) {
    /** Every value for a repeated query key, in order. */
    fun queryAll(key: String): List<String> = queryEntries.filter { it.first == key }.map { it.second }
}

/** Test double for the whole Supabase surface: a scripted responder over Ktor's MockEngine. */
class FakeSupabase(
    private val respond: suspend MockRequestHandleScope.(SeenRequest) -> HttpResponseData,
) {
    val seen = ArrayList<SeenRequest>()

    val engine = MockEngine { request ->
        val seenRequest = request.toSeen()
        seen.add(seenRequest)
        respond(seenRequest)
    }

    val http = SupabaseHttp(
        baseUrl = "https://example.supabase.co",
        anonKey = "publishable-key",
        accessToken = { "user-access-token" },
        engine = engine,
    )

    private suspend fun HttpRequestData.toSeen(): SeenRequest = SeenRequest(
        method = method.value,
        path = url.encodedPath,
        query = url.parameters.entries().associate { (k, v) -> k to v.first() },
        headers = headers.entries().associate { (k, v) -> k to v.first() },
        body = body.toByteArray().decodeToString(),
        queryEntries = url.parameters.entries().flatMap { (k, vs) -> vs.map { k to it } },
    )

    companion object {
        fun MockRequestHandleScope.json(body: String, status: HttpStatusCode = HttpStatusCode.OK): HttpResponseData =
            respond(body, status, headersOf(HttpHeaders.ContentType, ContentType.Application.Json.toString()))
    }
}
