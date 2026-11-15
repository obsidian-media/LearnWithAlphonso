package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class StreakWidgetTest {
    @Test
    fun `the caption is singular only for one day`() {
        assertEquals("day in a row", StreakWidgetCopy.caption(1))
        assertEquals("days in a row", StreakWidgetCopy.caption(0))
        assertEquals("days in a row", StreakWidgetCopy.caption(2))
        assertEquals("days in a row", StreakWidgetCopy.caption(31))
    }

    @Test
    fun `the best line never shows a best below the current streak`() {
        assertEquals("Best: 12", StreakWidgetCopy.best(streak = 4, longestStreak = 12))
        assertEquals("Best: 15", StreakWidgetCopy.best(streak = 15, longestStreak = 12))
    }

    @Test
    fun `the fixed strings are the ones iOS ships`() {
        assertEquals("Studied today", StreakWidgetCopy.STUDIED_TODAY)
        assertEquals("Not studied yet", StreakWidgetCopy.NOT_STUDIED_YET)
        assertEquals("Open Alphonso to start your streak", StreakWidgetCopy.EMPTY)
    }

    @Test
    fun `only the wide widget with a streak draws Alphonso and Best`() {
        val wide = StreakWidgetLayout.resolve(StreakWidgetFamily.MEDIUM, hasSnapshot = true)
        assertTrue(wide.showsAlphonso)
        assertTrue(wide.showsBest)
        assertFalse(wide.isEmpty)
        val small = StreakWidgetLayout.resolve(StreakWidgetFamily.SMALL, hasSnapshot = true)
        assertFalse(small.showsAlphonso)
        assertFalse(small.showsBest)
        assertFalse(small.isEmpty)
    }

    @Test
    fun `the empty state is the same at every size`() {
        for (family in StreakWidgetFamily.entries) {
            val empty = StreakWidgetLayout.resolve(family, hasSnapshot = false)
            assertTrue(empty.isEmpty)
            assertFalse(empty.showsAlphonso)
            assertFalse(empty.showsBest)
        }
    }

    @Test
    fun `a resizable widget goes wide at the threshold and not before`() {
        assertEquals(StreakWidgetFamily.SMALL, streakWidgetFamilyForWidth(110f))
        assertEquals(StreakWidgetFamily.SMALL, streakWidgetFamilyForWidth(STREAK_WIDGET_WIDE_MIN_DP - 0.5f))
        assertEquals(StreakWidgetFamily.MEDIUM, streakWidgetFamilyForWidth(STREAK_WIDGET_WIDE_MIN_DP))
        assertEquals(StreakWidgetFamily.MEDIUM, streakWidgetFamilyForWidth(300f))
    }

    @Test
    fun `a long streak gets a smaller number so it fits`() {
        assertEquals(1f, streakNumberScale(0))
        assertEquals(1f, streakNumberScale(99))
        assertEquals(0.7f, streakNumberScale(100))
        assertEquals(0.7f, streakNumberScale(999))
        assertEquals(0.5f, streakNumberScale(1000))
    }

    @Test
    fun `Royal follows the system`() {
        assertEquals(StreakWidgetLook.ROYAL_LIGHT, resolveStreakWidgetLook("royal", systemDark = false))
        assertEquals(StreakWidgetLook.ROYAL_NIGHT, resolveStreakWidgetLook("royal", systemDark = true))
    }

    @Test
    fun `Meadow stays light even in dark mode`() {
        assertEquals(StreakWidgetLook.MEADOW_LIGHT, resolveStreakWidgetLook("meadow", systemDark = false))
        assertEquals(StreakWidgetLook.MEADOW_LIGHT, resolveStreakWidgetLook("meadow", systemDark = true))
    }

    @Test
    fun `a missing or retired theme is Royal`() {
        assertEquals(StreakWidgetLook.ROYAL_LIGHT, resolveStreakWidgetLook(null, systemDark = false))
        assertEquals(StreakWidgetLook.ROYAL_NIGHT, resolveStreakWidgetLook(null, systemDark = true))
        assertEquals(StreakWidgetLook.ROYAL_NIGHT, resolveStreakWidgetLook("canopy", systemDark = true))
    }

    @Test
    fun `the theme round-trips through the stored json`() {
        val snapshot = StreakWidgetSnapshot(4, 12, studiedToday = false, updatedAtMillis = 1_700_000_000_000, theme = "meadow")
        val text = ContentJson.json.encodeToString(StreakWidgetSnapshot.serializer(), snapshot)
        assertEquals(snapshot, ContentJson.json.decodeFromString(StreakWidgetSnapshot.serializer(), text))
    }

    /** A snapshot an older build wrote has no theme key; it must still decode (else every installed widget goes blank) and read as Royal. */
    @Test
    fun `an old snapshot without a theme still decodes`() {
        val old = """{"streak":3,"longestStreak":9,"studiedToday":true,"updatedAtMillis":1700000000000}"""
        val decoded = ContentJson.json.decodeFromString(StreakWidgetSnapshot.serializer(), old)
        assertEquals(3, decoded.streak)
        assertEquals(9, decoded.longestStreak)
        assertTrue(decoded.studiedToday)
        assertNull(decoded.theme)
        assertEquals(StreakWidgetLook.ROYAL_LIGHT, resolveStreakWidgetLook(decoded.theme, systemDark = false))
    }

    @Test
    fun `makeStreakWidgetSnapshot carries the theme and withTheme changes only the theme`() {
        val zone = java.time.ZoneOffset.UTC
        val made = makeStreakWidgetSnapshot(5, 9, null, 1_700_000_000_000, zone, theme = "royal")
        assertEquals("royal", made.theme)
        assertNull(makeStreakWidgetSnapshot(5, 9, null, 1_700_000_000_000, zone).theme)
        val moved = made.withTheme("meadow")
        assertEquals("meadow", moved.theme)
        assertEquals(made.copy(theme = "meadow"), moved)
    }
}
