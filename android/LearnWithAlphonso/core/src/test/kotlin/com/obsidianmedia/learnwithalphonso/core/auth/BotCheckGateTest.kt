package com.obsidianmedia.learnwithalphonso.core.auth

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BotCheckGateTest {
    @Test
    fun `waits for the first token, spends it once, then waits for the next`() {
        val gate = BotCheckGate()
        assertFalse(gate.canSend)
        gate.receive("""{"type":"token","token":"t1"}""")
        assertTrue(gate.canSend)
        assertEquals("t1", gate.spend())
        assertNull(gate.spend())
        assertFalse(gate.canSend)
        gate.receive("""{"type":"token","token":"t2"}""")
        assertEquals("t2", gate.spend())
    }

    @Test
    fun `an expired token is never sent`() {
        val gate = BotCheckGate()
        gate.receive("""{"type":"token","token":"t1"}""")
        gate.receive("""{"type":"expired"}""")
        assertFalse(gate.canSend)
        assertNull(gate.spend())
    }

    @Test
    fun `no bot check configured sends without a token`() {
        val gate = BotCheckGate()
        gate.receive("""{"type":"unavailable"}""")
        assertTrue(gate.canSend)
        assertNull(gate.spend())
        assertTrue(gate.canSend)
    }

    @Test
    fun `a page that never answers does not block sign-in, but a slow token after an answer is waited for`() {
        val silent = BotCheckGate()
        silent.pageTimedOut()
        assertEquals(BotCheckGate.State.Unavailable, silent.state)
        val slow = BotCheckGate()
        slow.receive("""{"type":"expired"}""")
        slow.pageTimedOut()
        assertEquals(BotCheckGate.State.Waiting, slow.state)
    }

    @Test
    fun `ignores malformed messages`() {
        val gate = BotCheckGate()
        listOf("token", "{}", """{"type":"token"}""", """{"type":"token","token":""}""", """{"type":"other"}""", """{"type":1}""")
            .forEach(gate::receive)
        assertEquals(BotCheckGate.State.Waiting, gate.state)
        assertFalse(gate.heardFromPage)
    }
}
