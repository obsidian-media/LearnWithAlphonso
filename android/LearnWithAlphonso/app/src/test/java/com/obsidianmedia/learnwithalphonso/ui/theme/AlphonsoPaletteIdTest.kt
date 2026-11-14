package com.obsidianmedia.learnwithalphonso.ui.theme

import com.obsidianmedia.learnwithalphonso.data.MemoryPrefs
import org.junit.Assert.assertEquals
import org.junit.Test

/** The two themes (Royal and Meadow, Royal by default); the palette is the theme. */
class AlphonsoPaletteIdTest {
    private val retired = listOf("studio-ink", "manuscript", "canopy")

    @Test
    fun `two palettes, royal is the default`() {
        assertEquals(listOf("royal", "meadow"), AlphonsoPaletteId.entries.map { it.raw })
        assertEquals(AlphonsoPaletteId.ROYAL, AlphonsoPaletteId.DEFAULT)
    }

    @Test
    fun `the theme picker lists only Royal and Meadow`() {
        // SettingsScreen draws one row per AlphonsoThemeId entry.
        assertEquals(listOf("Royal", "Meadow"), AlphonsoThemeId.entries.map { it.displayName })
        assertEquals(listOf("royal", "meadow"), AlphonsoThemeId.entries.map { it.raw })
        assertEquals(AlphonsoThemeId.ROYAL, AlphonsoThemeId.DEFAULT)
    }

    @Test
    fun `each theme maps to the palette of the same name`() {
        assertEquals(AlphonsoPaletteId.MEADOW, AlphonsoPaletteId.forTheme(AlphonsoThemeId.MEADOW))
        assertEquals(AlphonsoPaletteId.ROYAL, AlphonsoPaletteId.forTheme(AlphonsoThemeId.ROYAL))
    }

    @Test
    fun `resolve keeps royal and meadow, and sends retired, unknown and missing values to royal`() {
        assertEquals(AlphonsoThemeId.MEADOW, AlphonsoThemeId.resolve("meadow"))
        assertEquals(AlphonsoThemeId.ROYAL, AlphonsoThemeId.resolve("royal"))
        retired.forEach { assertEquals(it, AlphonsoThemeId.ROYAL, AlphonsoThemeId.resolve(it)) }
        listOf(null, "", "Meadow", "solarized").forEach { assertEquals(it, AlphonsoThemeId.ROYAL, AlphonsoThemeId.resolve(it)) }
    }

    @Test
    fun `a stored meadow stays meadow, and the palette follows`() {
        val manager = ThemeManager(MemoryPrefs().apply { map["alphonso.theme"] = "meadow" })
        assertEquals(AlphonsoThemeId.MEADOW, manager.theme.value)
        assertEquals(AlphonsoPaletteId.MEADOW, manager.palette.value)
        manager.setTheme(AlphonsoThemeId.ROYAL)
        assertEquals(AlphonsoPaletteId.ROYAL, manager.palette.value)
    }

    @Test
    fun `a retired stored theme becomes royal and is rewritten, without an error`() {
        retired.forEach { old ->
            val prefs = MemoryPrefs().apply { map["alphonso.theme"] = old }
            val manager = ThemeManager(prefs)
            assertEquals(old, AlphonsoThemeId.ROYAL, manager.theme.value)
            assertEquals(old, AlphonsoPaletteId.ROYAL, manager.palette.value)
            assertEquals(old, "royal", prefs.map["alphonso.theme"])
        }
    }

    @Test
    fun `nothing stored is royal and nothing is written`() {
        val prefs = MemoryPrefs()
        val manager = ThemeManager(prefs)
        assertEquals(AlphonsoThemeId.ROYAL, manager.theme.value)
        assertEquals(null, prefs.map["alphonso.theme"])
    }

    @Test
    fun `the old separate palette preference is dropped`() {
        val prefs = MemoryPrefs().apply { map["alphonso.palette"] = "meadow" }
        ThemeManager(prefs)
        assertEquals(null, prefs.map["alphonso.palette"])
    }

    @Test
    fun `the account value wins, a retired one means royal, and null leaves the device choice alone`() {
        val manager = ThemeManager(MemoryPrefs().apply { map["alphonso.theme"] = "meadow" })
        manager.hydrateFromServer(null)
        assertEquals(AlphonsoThemeId.MEADOW, manager.theme.value)
        manager.hydrateFromServer("canopy")
        assertEquals(AlphonsoThemeId.ROYAL, manager.theme.value)
        manager.hydrateFromServer("meadow")
        assertEquals(AlphonsoThemeId.MEADOW, manager.theme.value)
        manager.hydrateFromServer("royal")
        assertEquals(AlphonsoThemeId.ROYAL, manager.theme.value)
    }

    @Test
    fun `the token colours follow the palette and night`() {
        assertEquals(AlphonsoTokens.meadowNight, AlphonsoTokens.colors(AlphonsoPaletteId.MEADOW, night = true))
        assertEquals(AlphonsoTokens.royalLight, AlphonsoTokens.colors(AlphonsoPaletteId.ROYAL, night = false))
    }
}
