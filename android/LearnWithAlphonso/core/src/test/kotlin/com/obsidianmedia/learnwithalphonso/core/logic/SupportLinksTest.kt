package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class SupportLinksTest {
    @Test
    fun `every id has a label and a listed id parses`() {
        for (id in SupportLinkId.entries) {
            assertEquals(id, SupportLinkId.parse(id.wire))
            assert(id.label.isNotBlank())
        }
        assertEquals("Open the subscription screen", SupportLinkId.SUBSCRIPTION.label)
        assertEquals("Open AI features", SupportLinkId.AI_FEATURES.label)
        assertEquals("Open Settings", SupportLinkId.SETTINGS.label)
        assertEquals("Open your league", SupportLinkId.LEAGUE.label)
    }

    @Test
    fun `anything off the list is dropped`() {
        for (bad in listOf("https://evil.example", "javascript:alert(1)", "Subscription", "subscription ", "", null)) {
            assertNull(SupportLinkId.parse(bad), "parsed $bad")
        }
    }

    @Test
    fun `a trailing marker on an ai body is lifted off and never shown`() {
        val (text, link) = SupportLinks.split("Tap Restore Purchases.\n\n[[link:subscription]]")
        assertEquals("Tap Restore Purchases.", text)
        assertEquals(SupportLinkId.SUBSCRIPTION, link)
    }

    @Test
    fun `an unknown id leaves no link and the marker still never shows`() {
        assertEquals("Go here" to null, SupportLinks.split("Go here\n\n[[link:https://evil.example]]"))
        assertEquals("Go here" to null, SupportLinks.split("Go here [[link:nope]]"))
        assertEquals("Go here" to null, SupportLinks.split("Go here [[link:]]"))
    }

    @Test
    fun `a marker that is not at the end is plain text`() {
        val body = "Use [[link:subscription]] later on, then continue"
        assertEquals(body to null, SupportLinks.split(body))
    }

    @Test
    fun `present lifts the marker on an ai row`() {
        assertEquals("Hello" to SupportLinkId.LEAGUE, SupportLinks.present(SupportMessageKind.AI, "Hello\n\n[[link:league]]", null))
    }

    @Test
    fun `present trusts a listed server link and drops a forged one`() {
        assertEquals("Hello" to SupportLinkId.SETTINGS, SupportLinks.present(SupportMessageKind.AI, "Hello", "settings"))
        assertEquals("Hello" to null, SupportLinks.present(SupportMessageKind.AI, "Hello", "https://evil.example"))
    }

    @Test
    fun `a marker typed by the learner or sent by a person is left as typed with no link`() {
        val typed = "Please [[link:subscription]]"
        for (kind in listOf(SupportMessageKind.YOU, SupportMessageKind.SUPPORT, SupportMessageKind.SYSTEM)) {
            assertEquals(typed to null, SupportLinks.present(kind, typed, "subscription"), "kind $kind")
        }
    }
}
