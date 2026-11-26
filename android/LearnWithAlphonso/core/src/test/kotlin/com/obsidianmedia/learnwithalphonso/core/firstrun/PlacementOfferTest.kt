package com.obsidianmedia.learnwithalphonso.core.firstrun

import com.obsidianmedia.learnwithalphonso.core.firstrun.PlacementOffer.Style
import com.obsidianmedia.learnwithalphonso.core.firstrun.PlacementOffer.Surface
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test

class PlacementOfferTest {
    private fun style(level: String?, surface: Surface, taken: Boolean = false, dismissed: Boolean = false) =
        PlacementOffer.style(level, taken, dismissed, surface)

    @Test
    fun `knows some or confident is offered prominently on both surfaces`() {
        for (level in listOf("some", "confident")) {
            assertEquals(Style.PROMINENT, style(level, Surface.HECTOR_END), level)
            assertEquals(Style.PROMINENT, style(level, Surface.LEARN), level)
        }
    }

    @Test
    fun `true beginners are not pushed but keep the small Learn card`() {
        assertEquals(Style.NONE, style("new", Surface.HECTOR_END))
        assertEquals(Style.QUIET, style("new", Surface.LEARN))
        assertEquals(Style.NONE, style(null, Surface.HECTOR_END))
        assertEquals(Style.QUIET, style(null, Surface.LEARN))
    }

    @Test
    fun `Not now hides the Hector prompt and quietens the Learn card`() {
        assertEquals(Style.NONE, style("some", Surface.HECTOR_END, dismissed = true))
        assertEquals(Style.QUIET, style("some", Surface.LEARN, dismissed = true))
    }

    @Test
    fun `taking placement ends every offer`() {
        for (level in listOf("new", "some", "confident", null))
            for (dismissed in listOf(false, true))
                for (surface in Surface.values())
                    assertEquals(Style.NONE, style(level, surface, taken = true, dismissed = dismissed))
    }

    @Test
    fun `the dismissal is kept per course`() {
        assertNotEquals(PlacementOffer.dismissKey("fr"), PlacementOffer.dismissKey("es"))
    }
}
