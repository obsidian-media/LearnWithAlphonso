package com.obsidianmedia.learnwithalphonso.widget

import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.data.MemoryPrefs
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class WidgetPublisherTest {
    @Test
    fun `the written snapshot reads back and studiedToday follows the UTC date`() {
        val prefs = MemoryPrefs()
        assertNull(WidgetPublisher.read(prefs))
        val now = Instant.parse("2026-09-13T23:30:00Z").toEpochMilli()
        val progress = LessonCompletionProgress(xp = 120, streak = 4, longestStreak = 12, lastActiveDate = "2026-09-13", hearts = 5, streakFreezes = 0, leagueTier = "bronze")
        val written = WidgetPublisher.write(prefs, progress, now)
        assertTrue(written.studiedToday)
        assertEquals(written, WidgetPublisher.read(prefs))
        assertFalse(WidgetPublisher.write(prefs, progress.copy(lastActiveDate = "2026-09-12"), now).studiedToday)
        assertEquals(4, WidgetPublisher.read(prefs)!!.streak)
    }

    @Test
    fun `the theme is written with the snapshot and read back`() {
        val prefs = MemoryPrefs()
        val progress = LessonCompletionProgress(xp = 120, streak = 4, longestStreak = 12, lastActiveDate = "2026-09-13", hearts = 5, streakFreezes = 0, leagueTier = "bronze")
        assertEquals("meadow", WidgetPublisher.write(prefs, progress, theme = "meadow").theme)
        assertEquals("meadow", WidgetPublisher.read(prefs)!!.theme)
        assertNull(WidgetPublisher.write(prefs, progress).theme)
    }

    @Test
    fun `a theme change rewrites only the theme of what was published`() {
        val prefs = MemoryPrefs()
        val progress = LessonCompletionProgress(xp = 120, streak = 4, longestStreak = 12, lastActiveDate = "2026-09-13", hearts = 5, streakFreezes = 0, leagueTier = "bronze")
        val before = WidgetPublisher.write(prefs, progress, nowMillis = 1_700_000_000_000, theme = "royal")
        assertTrue(WidgetPublisher.writeTheme(prefs, "meadow"))
        assertEquals(before.copy(theme = "meadow"), WidgetPublisher.read(prefs))
    }

    @Test
    fun `a theme change with nothing published writes nothing`() {
        val prefs = MemoryPrefs()
        assertFalse(WidgetPublisher.writeTheme(prefs, "meadow"))
        assertNull(WidgetPublisher.read(prefs))
    }

    @Test
    fun `an old snapshot without a theme still reads`() {
        val prefs = MemoryPrefs()
        prefs.edit().putString("streakWidgetSnapshot", """{"streak":3,"longestStreak":9,"studiedToday":true,"updatedAtMillis":1700000000000}""").apply()
        val read = WidgetPublisher.read(prefs)!!
        assertEquals(3, read.streak)
        assertNull(read.theme)
    }

    @Test
    fun `clearing forgets the snapshot, so the next account does not see the last one's streak`() {
        val prefs = MemoryPrefs()
        val progress = LessonCompletionProgress(xp = 120, streak = 4, longestStreak = 12, lastActiveDate = "2026-09-13", hearts = 5, streakFreezes = 0, leagueTier = "bronze")
        WidgetPublisher.write(prefs, progress)
        WidgetPublisher.clear(prefs)
        assertNull(WidgetPublisher.read(prefs))
    }
}
