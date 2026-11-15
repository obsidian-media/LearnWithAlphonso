package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class PushTapTest {
    @Test
    fun `a support reply opens the Help chat`() {
        assertEquals(PushTapDestination.HELP, PushTap.destination("support"))
    }

    @Test
    fun `the other push types have no destination and just open the app`() {
        for (type in listOf("nudge", "overtake", "Support", "support ", "SUPPORT", "help", "")) {
            assertNull(PushTap.destination(type), type)
        }
    }

    @Test
    fun `no type has no destination`() {
        assertNull(PushTap.destination(null))
    }

    @Test
    fun `the extra is the same key the server sends`() {
        assertEquals("type", PushTap.EXTRA_TYPE)
    }
}
