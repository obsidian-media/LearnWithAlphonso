package com.obsidianmedia.learnwithalphonso.ui.theme

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AlphonsoPalettesTest {
    @Test
    fun `palette catalog matches the iOS values and default is canopy`() {
        assertEquals(Color(0xFF0C6944), AlphonsoPalettes.light.getValue(AlphonsoThemeId.CANOPY).moss)
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
        assertEquals(Color(0xFF0C1813), AlphonsoPalettes.resolve(AlphonsoThemeId.CANOPY, systemDark = true).surface)
    }
}
