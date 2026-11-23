package com.obsidianmedia.learnwithalphonso.core.podcast

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class MiniBarPresentationTest {
    @Test
    fun `the pill carries the play button and a close X`() {
        assertEquals(listOf(PlayerAction.TOGGLE, PlayerAction.CLOSE), MiniBarPresentation.pillActions())
        assertEquals("Close player", MiniBarPresentation.CLOSE_LABEL)
        // Next and transcript stay off the pill so the title keeps its room.
        assertFalse(PlayerAction.NEXT in MiniBarPresentation.pillActions())
        assertFalse(PlayerAction.TRANSCRIPT in MiniBarPresentation.pillActions())
    }

    @Test
    fun `next, transcript and close are reachable in the expanded player`() {
        val withNext = MiniBarPresentation.expandedActions(hasNext = true)
        assertTrue(withNext.containsAll(listOf(PlayerAction.NEXT, PlayerAction.TRANSCRIPT, PlayerAction.CLOSE, PlayerAction.TOGGLE)))
        assertFalse(PlayerAction.NEXT in MiniBarPresentation.expandedActions(hasNext = false))
    }

    @Test
    fun `every action has a home, none is lost when it leaves the pill`() {
        for (hasNext in listOf(true, false)) {
            val home = MiniBarPresentation.pillActions() + MiniBarPresentation.expandedActions(hasNext)
            for (a in PlayerAction.entries) if (a != PlayerAction.NEXT || hasNext) assertTrue(a in home, "$a (hasNext=$hasNext)")
        }
    }

    @Test
    fun `the toggle is labelled for what a tap does`() {
        assertEquals("Pause", MiniBarPresentation.toggleLabel(PodcastPlayerControl.PAUSE, "Retry"))
        assertEquals("Play", MiniBarPresentation.toggleLabel(PodcastPlayerControl.PLAY, "Retry"))
        assertEquals("Retry", MiniBarPresentation.toggleLabel(PodcastPlayerControl.RETRY, "Retry"))
        assertEquals("Loading", MiniBarPresentation.toggleLabel(PodcastPlayerControl.SPINNER, "Retry"))
    }
}
