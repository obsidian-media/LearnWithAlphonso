package com.obsidianmedia.learnwithalphonso.ui.theme

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AlphonsoPalettesTest {
    @Test
    fun `palette catalog matches the iOS values and default is canopy`() {
        assertEquals(Color(0xFF1D2B64), AlphonsoPalettes.light.getValue(AlphonsoThemeId.CANOPY).moss)
        assertEquals(Color(0xFF0B0D12), AlphonsoPalettes.light.getValue(AlphonsoThemeId.STUDIO_INK).surface)
        assertEquals(setOf(AlphonsoThemeId.MEADOW, AlphonsoThemeId.MANUSCRIPT, AlphonsoThemeId.CANOPY), AlphonsoPalettes.dark.keys)
        assertEquals(AlphonsoThemeId.CANOPY, AlphonsoThemeId.DEFAULT)
        assertEquals(AlphonsoThemeId.STUDIO_INK, AlphonsoThemeId.fromRaw("studio-ink"))
    }

    @Test
    fun `resolve follows the system for light themes and never for studio ink`() {
        assertTrue(AlphonsoPalettes.resolve(AlphonsoThemeId.CANOPY, systemDark = true).isDark)
        assertTrue(!AlphonsoPalettes.resolve(AlphonsoThemeId.CANOPY, systemDark = false).isDark)
        assertTrue(AlphonsoPalettes.resolve(AlphonsoThemeId.STUDIO_INK, systemDark = false).isDark)
        assertEquals(Color(0xFF0E1330), AlphonsoPalettes.resolve(AlphonsoThemeId.CANOPY, systemDark = true).surface)
    }

    private fun luminance(c: Color): Double {
        fun channel(v: Float): Double = if (v <= 0.03928f) v / 12.92 else Math.pow((v + 0.055) / 1.055, 2.4)
        return 0.2126 * channel(c.red) + 0.7152 * channel(c.green) + 0.0722 * channel(c.blue)
    }

    private fun contrast(a: Color, b: Color): Double {
        val (hi, lo) = listOf(luminance(a), luminance(b)).sortedDescending()
        return (hi + 0.05) / (lo + 0.05)
    }

    @Test
    fun `secondary buttons and row cards keep ink on parchment at 4_5 to 1 or better in every theme`() {
        // The podcast "Take the quiz" chip and the episode card both sit on the scene photo with these two tokens.
        val all = AlphonsoPalettes.light.values + AlphonsoPalettes.dark.values
        assertEquals(7, all.size)
        all.forEach { p -> assertTrue("ink on parchment ${contrast(p.ink, p.parchment)}", contrast(p.ink, p.parchment) >= 4.5) }
    }
}
