package com.obsidianmedia.learnwithalphonso.ui.practice

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.ApiHttp
import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CallRecapControllerTest {
    private fun recap(said: String) =
        """{"recap":{"corrections":[{"said":"$said","fixed":"fixed $said","why":"w","topic":"ser-estar","label":"Ser or estar"}],"phrase":null,"reviewToken":"t","saved":false,"reviewCount":1}}"""

    private val call = (0 until 3).flatMap { listOf(ChatMessage("user", "u$it"), ChatMessage("assistant", "ok")) }
    private fun controller(s: FakeServer) =
        CallRecapController(AiConversationClient(ApiHttp("https://api.example", { "tok" }, s.engine)), CoroutineScope(SupervisorJob() + Dispatchers.Default))

    @Test
    fun `a recap that arrives after a reset is never shown`() = runBlocking {
        val release = CompletableDeferred<Unit>()
        val s = FakeServer { req ->
            if (req.path.endsWith("/api/call-recap") && req.body.contains("call-old")) { release.await(); json(recap("OLD")) } else json(recap("NEW"))
        }
        val c = controller(s)
        c.start("call-old", call, null)
        assertEquals(CallRecapController.Status.PENDING, c.ui.value.status)
        c.reset() // retry or next scene while it is pending
        assertEquals(CallRecapController.Status.OFF, c.ui.value.status)
        c.start("call-new", call, null)
        awaitTrue("new recap") { c.ui.value.status == CallRecapController.Status.READY }
        release.complete(Unit)
        delay(300)
        assertEquals("NEW", c.ui.value.recap!!.corrections.single().said)
    }

    @Test
    fun `reset while pending leaves nothing behind`() = runBlocking {
        val release = CompletableDeferred<Unit>()
        val s = FakeServer { release.await(); json(recap("OLD")) }
        val c = controller(s)
        c.start("call-old", call, null)
        c.reset()
        release.complete(Unit)
        delay(300)
        assertEquals(CallRecapController.Status.OFF, c.ui.value.status)
        assertNull(c.ui.value.recap)
        assertFalse(c.attempted)
    }

    @Test
    fun `a short call is off from the start and sends nothing`() = runBlocking {
        val s = FakeServer { json(recap("X")) }
        val c = controller(s)
        c.start("call", call.take(2), null)
        assertEquals(CallRecapController.Status.OFF, c.ui.value.status)
        assertTrue(s.seen.isEmpty())
    }
}
