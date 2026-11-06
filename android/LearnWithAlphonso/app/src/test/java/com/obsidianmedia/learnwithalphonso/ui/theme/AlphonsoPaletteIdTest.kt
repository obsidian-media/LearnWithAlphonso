package com.obsidianmedia.learnwithalphonso.ui.theme

import com.obsidianmedia.learnwithalphonso.data.MemoryPrefs
import org.junit.Assert.assertEquals
import org.junit.Test

/** The palette preference (visual round 6): Royal or Meadow, Royal by default, stored next to the theme. */
class AlphonsoPaletteIdTest {
    @Test
    fun `two palettes, royal is the default`() {
        assertEquals(listOf("royal", "meadow"), AlphonsoPaletteId.entries.map { it.raw })
        assertEquals(AlphonsoPaletteId.ROYAL, AlphonsoPaletteId.DEFAULT)
    }

    @Test
    fun `each retired theme maps to a palette - meadow stays meadow, the rest become royal`() {
        assertEquals(AlphonsoPaletteId.MEADOW, AlphonsoPaletteId.forTheme(AlphonsoThemeId.MEADOW))
        assertEquals(AlphonsoPaletteId.ROYAL, AlphonsoPaletteId.forTheme(AlphonsoThemeId.CANOPY))
        assertEquals(AlphonsoPaletteId.ROYAL, AlphonsoPaletteId.forTheme(AlphonsoThemeId.STUDIO_INK))
        assertEquals(AlphonsoPaletteId.ROYAL, AlphonsoPaletteId.forTheme(AlphonsoThemeId.MANUSCRIPT))
    }

    @Test
    fun `with no palette stored the palette follows the stored theme`() {
        val prefs = MemoryPrefs().apply { map["alphonso.theme"] = "meadow" }
        val manager = ThemeManager(prefs)
        assertEquals(AlphonsoPaletteId.MEADOW, manager.palette.value)
        manager.setTheme(AlphonsoThemeId.CANOPY)
        assertEquals(AlphonsoPaletteId.ROYAL, manager.palette.value)
    }

    @Test
    fun `a chosen palette is stored and wins over the theme`() {
        val prefs = MemoryPrefs()
        val manager = ThemeManager(prefs)
        assertEquals(AlphonsoPaletteId.ROYAL, manager.palette.value)
        manager.setPalette(AlphonsoPaletteId.MEADOW)
        assertEquals("meadow", prefs.map["alphonso.palette"])
        manager.setTheme(AlphonsoThemeId.STUDIO_INK)
        assertEquals(AlphonsoPaletteId.MEADOW, manager.palette.value)
        assertEquals(AlphonsoPaletteId.MEADOW, ThemeManager(prefs).palette.value)
    }

    @Test
    fun `the token colours follow the palette and night`() {
        assertEquals(AlphonsoTokens.meadowNight, AlphonsoTokens.colors(AlphonsoPaletteId.MEADOW, night = true))
        assertEquals(AlphonsoTokens.royalLight, AlphonsoTokens.colors(AlphonsoPaletteId.ROYAL, night = false))
    }
}
