package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class InviteLinkTest {
    @Test
    fun `reads the code from a real invite link`() {
        assertEquals("a1b2c3d4e5f6", InviteLink.codeFrom(listOf("invite", "a1b2c3d4e5f6")))
    }

    @Test
    fun `refuses a code carrying a slash, a dot path, a query or anything but letters and digits`() {
        for (bad in listOf("a/b", "a%2Fb", "..", "abc?x=1", "abc#frag", "abc def", "café12", "", " ")) {
            assertNull(InviteLink.codeFrom(listOf("invite", bad)), bad)
        }
    }

    @Test
    fun `refuses other paths and codes of the wrong length`() {
        assertNull(InviteLink.codeFrom(listOf("invites", "a1b2c3d4e5f6")))
        assertNull(InviteLink.codeFrom(listOf("invite", "a1b2c3d4e5f6", "x")))
        assertNull(InviteLink.codeFrom(listOf("invite", "abc12")))
        assertNull(InviteLink.codeFrom(listOf("invite", "a".repeat(65))))
    }

    @Test
    fun `reads a code from a pasted link or a bare code`() {
        assertEquals("a1b2c3d4e5f6", InviteLink.codeFromEntry(" https://learn.alphonsoecosystem.app/invite/a1b2c3d4e5f6 "))
        assertEquals("a1b2c3d4e5f6", InviteLink.codeFromEntry("a1b2c3d4e5f6"))
        assertNull(InviteLink.codeFromEntry("https://evil.example/invite/a1b2c3d4e5f6"))
        assertNull(InviteLink.codeFromEntry("https://learn.alphonsoecosystem.app/learn"))
        assertNull(InviteLink.codeFromEntry("not a code"))
    }
}
