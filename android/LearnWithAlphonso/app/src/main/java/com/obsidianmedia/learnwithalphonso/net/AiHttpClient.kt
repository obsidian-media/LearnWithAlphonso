package com.obsidianmedia.learnwithalphonso.net

import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/**
 * Timeouts for the AI and audio routes (Hector, chat, speech to text, text to speech, grading, explain, Help chat).
 * OkHttp's defaults read for 10 seconds, which a model reply or a long recording upload often exceeds: the learner saw a
 * failure while the server was still answering. Normal API calls keep the shared client's defaults, so a dead network
 * still fails them fast. A call that sets its own timeout (ApiHttp's `timeoutMillis`) keeps it.
 */
object AiHttpClient {
    const val CONNECT_SECONDS = 10L

    /** Longest wait between two bytes, either way (a model thinking before its first byte, a slow upload). */
    const val READ_WRITE_SECONDS = 60L

    /** The whole call, from connect to the last byte of the reply. */
    const val CALL_SECONDS = 90L

    /** Built from the shared client, so both use one connection pool and dispatcher. */
    fun from(shared: OkHttpClient): OkHttpClient = shared.newBuilder()
        .connectTimeout(CONNECT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(READ_WRITE_SECONDS, TimeUnit.SECONDS)
        .writeTimeout(READ_WRITE_SECONDS, TimeUnit.SECONDS)
        .callTimeout(CALL_SECONDS, TimeUnit.SECONDS)
        .build()
}
