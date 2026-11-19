package com.obsidianmedia.learnwithalphonso.net

import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class AiHttpClientTest {
    @Test
    fun `AI and audio calls wait long enough for a model reply, and the whole call is still bounded`() {
        val ai = AiHttpClient.from(OkHttpClient())
        assertEquals(10_000, ai.connectTimeoutMillis)
        assertEquals(60_000, ai.readTimeoutMillis)
        assertEquals(60_000, ai.writeTimeoutMillis)
        assertEquals(90_000, ai.callTimeoutMillis)
    }

    @Test
    fun `the shared client keeps its fast defaults and shares its pool with the AI client`() {
        val shared = OkHttpClient()
        val ai = AiHttpClient.from(shared)
        assertEquals("normal API calls still fail fast on a dead network", 10_000, shared.readTimeoutMillis)
        assertEquals(0, shared.callTimeoutMillis)
        assertSame(shared.connectionPool, ai.connectionPool)
        assertSame(shared.dispatcher, ai.dispatcher)
    }
}
