package com.obsidianmedia.learnwithalphonso.ui.theme

import com.obsidianmedia.learnwithalphonso.core.avatar.ScreenSceneArt
import org.junit.Assert.assertEquals
import org.junit.Test

/** The theme to picture mapping: only Royal on a dark device shows the night rooms; Meadow stays light. */
class ScreenSceneLookTest {
    private fun path(theme: AlphonsoThemeId, systemDark: Boolean) =
        ScreenSceneArt.assetPath("learn", AlphonsoPalettes.usesNight(theme, systemDark))

    @Test
    fun `royal light shows the day picture`() = assertEquals("screen-scenes/learn.jpg", path(AlphonsoThemeId.ROYAL, false))

    @Test
    fun `royal night shows the night picture`() = assertEquals("screen-scenes/night-learn.jpg", path(AlphonsoThemeId.ROYAL, true))

    @Test
    fun `meadow keeps the day picture in a light device and in a dark one`() {
        assertEquals("screen-scenes/learn.jpg", path(AlphonsoThemeId.MEADOW, false))
        assertEquals("screen-scenes/learn.jpg", path(AlphonsoThemeId.MEADOW, true))
    }
}
