package com.obsidianmedia.learnwithalphonso.widget

import com.obsidianmedia.learnwithalphonso.core.logic.StreakWidgetLook
import com.obsidianmedia.learnwithalphonso.core.logic.resolveStreakWidgetLook
import com.obsidianmedia.learnwithalphonso.ui.theme.AlphonsoTokens
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertSame
import org.junit.Test

/** The widget draws with the generated design system colours, one set per look. */
class StreakWidgetColorsTest {
    @Test
    fun `each look is its design system colour set`() {
        assertSame(AlphonsoTokens.royalLight, streakWidgetColors(StreakWidgetLook.ROYAL_LIGHT))
        assertSame(AlphonsoTokens.royalNight, streakWidgetColors(StreakWidgetLook.ROYAL_NIGHT))
        assertSame(AlphonsoTokens.meadowLight, streakWidgetColors(StreakWidgetLook.MEADOW_LIGHT))
    }

    /** What the widget hands the system as its day and night colour: Royal changes, Meadow does not. */
    @Test
    fun `Royal's night surface differs from its day surface`() {
        val day = streakWidgetColors(resolveStreakWidgetLook("royal", systemDark = false))
        val night = streakWidgetColors(resolveStreakWidgetLook("royal", systemDark = true))
        assertNotEquals(day.surface, night.surface)
        assertNotEquals(day.ink, night.ink)
    }

    @Test
    fun `Meadow's night colours are its day colours, so a dark system never changes it`() {
        val day = streakWidgetColors(resolveStreakWidgetLook("meadow", systemDark = false))
        val night = streakWidgetColors(resolveStreakWidgetLook("meadow", systemDark = true))
        assertEquals(day.surface, night.surface)
        assertEquals(day.ink, night.ink)
        assertEquals(day.inkSoft, night.inkSoft)
        assertEquals(day.rightTint, night.rightTint)
        assertEquals(day.actionTint, night.actionTint)
        assertSame(AlphonsoTokens.meadowLight, day)
    }
}
