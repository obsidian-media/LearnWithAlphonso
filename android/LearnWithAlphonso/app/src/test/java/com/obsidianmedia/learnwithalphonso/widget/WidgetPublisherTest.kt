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
}
