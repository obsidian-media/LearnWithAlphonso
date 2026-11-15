package com.obsidianmedia.learnwithalphonso.ui.theme

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OnChoiceTest {
    @Test
    fun `glyphs on the choice face read at 4_5 to 1 in every palette, light and night`() {
        for (id in AlphonsoPaletteId.entries) for (night in listOf(false, true)) {
            val c = AlphonsoTokens.colors(id, night)
            val ratio = contrastRatio(c.onChoice, c.choice)
            assertTrue("$id night=$night onChoice on choice is $ratio", ratio >= 4.5)
        }
    }

    @Test
    fun `plain white on choice is not enough at night, which is why the token exists`() {
        val night = AlphonsoTokens.colors(AlphonsoPaletteId.ROYAL, true)
        assertTrue(contrastRatio(night.onHero, night.choice) < 4.5)
    }

    @Test
    fun `contrast ratio is the WCAG one`() {
        assertEquals(21.0, contrastRatio(Color.White, Color.Black), 0.01)
        assertEquals(1.0, contrastRatio(Color.White, Color.White), 0.0001)
    }
}
