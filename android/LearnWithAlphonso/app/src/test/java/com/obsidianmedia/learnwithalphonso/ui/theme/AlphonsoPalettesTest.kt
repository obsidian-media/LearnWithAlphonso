package com.obsidianmedia.learnwithalphonso.ui.theme

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AlphonsoPalettesTest {
    @Test
    fun `palette catalog has royal and meadow, only royal has a night variant, and royal is the default`() {
        assertEquals(Color(0xFF1D2B64), AlphonsoPalettes.light.getValue(AlphonsoThemeId.ROYAL).moss)
        assertEquals(setOf(AlphonsoThemeId.ROYAL, AlphonsoThemeId.MEADOW), AlphonsoPalettes.light.keys)
        assertEquals(setOf(AlphonsoThemeId.ROYAL), AlphonsoPalettes.dark.keys)
        assertEquals(AlphonsoThemeId.ROYAL, AlphonsoThemeId.DEFAULT)
    }

    @Test
    fun `resolve follows the system for Royal`() {
        assertTrue(AlphonsoPalettes.resolve(AlphonsoThemeId.ROYAL, systemDark = true).isDark)
        assertTrue(!AlphonsoPalettes.resolve(AlphonsoThemeId.ROYAL, systemDark = false).isDark)
        assertEquals(Color(0xFF0E1330), AlphonsoPalettes.resolve(AlphonsoThemeId.ROYAL, systemDark = true).surface)
        assertEquals(Color(0xFFFBF6EC), AlphonsoPalettes.resolve(AlphonsoThemeId.ROYAL, systemDark = false).surface)
    }

    @Test
    fun `Meadow stays light, even in dark mode`() {
        val onDarkDevice = AlphonsoPalettes.resolve(AlphonsoThemeId.MEADOW, systemDark = true)
        assertEquals(AlphonsoPalettes.light.getValue(AlphonsoThemeId.MEADOW), onDarkDevice)
        assertEquals(onDarkDevice, AlphonsoPalettes.resolve(AlphonsoThemeId.MEADOW, systemDark = false))
        assertTrue(!onDarkDevice.isDark)
        assertEquals(Color(0xFFF5F0E8), onDarkDevice.surface)
        assertTrue(!AlphonsoPalettes.usesNight(AlphonsoThemeId.MEADOW, systemDark = true))
        assertTrue(AlphonsoPalettes.usesNight(AlphonsoThemeId.ROYAL, systemDark = true))
        assertTrue(!AlphonsoPalettes.usesNight(AlphonsoThemeId.ROYAL, systemDark = false))
    }

    @Test
    fun `Meadow gets the light Material colour scheme and light system bars on a dark device`() {
        val meadowOnDark = colorSchemeFor(AlphonsoPalettes.resolve(AlphonsoThemeId.MEADOW, systemDark = true))
        val meadowLight = colorSchemeFor(AlphonsoPalettes.resolve(AlphonsoThemeId.MEADOW, systemDark = false))
        assertEquals(meadowLight, meadowOnDark)
        // The base light scheme's untouched slots (not set from the palette) are the light ones, not the dark base's.
        assertEquals(androidx.compose.material3.lightColorScheme().inverseSurface, meadowOnDark.inverseSurface)
        val royalNight = colorSchemeFor(AlphonsoPalettes.resolve(AlphonsoThemeId.ROYAL, systemDark = true))
        assertEquals(androidx.compose.material3.darkColorScheme().inverseSurface, royalNight.inverseSurface)
        assertEquals(SystemBars.LIGHT, AlphonsoPalettes.systemBars(AlphonsoThemeId.MEADOW))
        assertEquals(SystemBars.FOLLOW_SYSTEM, AlphonsoPalettes.systemBars(AlphonsoThemeId.ROYAL))
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
        assertEquals(3, all.size)
        all.forEach { p -> assertTrue("ink on parchment ${contrast(p.ink, p.parchment)}", contrast(p.ink, p.parchment) >= 4.5) }
    }
}
