package com.obsidianmedia.learnwithalphonso.core.podcast

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PodcastTimingsTest {
    private val lines = listOf(
        TimedLine(0.0, "One.", true),
        TimedLine(4.0, "Two.", false),
        TimedLine(9.5, "Three.", true),
        TimedLine(20.0, "Four.", false),
    )

    @Test
    fun `no lines is minus one`() = assertEquals(-1, PodcastTimings.activeIndex(emptyList(), 5.0))

    @Test
    fun `before and at the first start is the first line`() {
        assertEquals(0, PodcastTimings.activeIndex(lines, 0.0))
        assertEquals(0, PodcastTimings.activeIndex(lines, -3.0))
    }

    @Test
    fun `is the last line started at or before the time`() {
        assertEquals(0, PodcastTimings.activeIndex(lines, 3.99))
        assertEquals(1, PodcastTimings.activeIndex(lines, 4.0))
        assertEquals(1, PodcastTimings.activeIndex(lines, 9.49))
        assertEquals(2, PodcastTimings.activeIndex(lines, 9.5))
        assertEquals(2, PodcastTimings.activeIndex(lines, 19.9))
    }

    @Test
    fun `at and after the end is the last line`() {
        assertEquals(3, PodcastTimings.activeIndex(lines, 20.0))
        assertEquals(3, PodcastTimings.activeIndex(lines, 9999.0))
    }

    @Test
    fun `a non-finite time is the start`() = assertEquals(0, PodcastTimings.activeIndex(lines, Double.NaN))

    @Test
    fun `matches a linear scan over many lines`() {
        val many = (0 until 200).map { TimedLine(it * 1.7, "l$it") }
        var t = -1.0
        while (t < 360) {
            val want = many.indexOfLast { it.s <= t }.coerceAtLeast(0)
            assertEquals(want, PodcastTimings.activeIndex(many, t), "t=$t")
            t += 0.37
        }
    }

    @Test
    fun `lines that spell the transcript are returned, whitespace aside`() {
        assertEquals(lines, PodcastTimings.linesMatching(lines, "One. Two.\n\nThree. Four."))
        assertEquals(lines, PodcastTimings.linesMatching(lines, "One.   Two.\nThree.\n\nFour."))
    }

    @Test
    fun `an edited transcript drops the timings`() {
        assertNull(PodcastTimings.linesMatching(lines, "One. Two. Three. Fourth."))
    }

    @Test
    fun `missing pieces are null`() {
        assertNull(PodcastTimings.linesMatching(null, "x"))
        assertNull(PodcastTimings.linesMatching(lines, null))
        assertNull(PodcastTimings.linesMatching(emptyList(), "x"))
    }

    @Test
    fun `starts going backwards are rejected`() {
        val bad = listOf(TimedLine(5.0, "One."), TimedLine(2.0, "Two."), TimedLine(9.0, "Three."), TimedLine(12.0, "Four."))
        assertNull(PodcastTimings.linesMatching(bad, "One. Two. Three. Four."))
    }

    @Test
    fun `decodes the bundled shape and survives garbage`() {
        val json = """{"ep-1":{"slug":"x","lines":[{"s":0,"t":"Hi.","p":true},{"s":3.5,"t":"Bye.","p":false}]}}"""
        assertEquals(listOf(TimedLine(0.0, "Hi.", true), TimedLine(3.5, "Bye.", false)), PodcastTimings.decode(json)["ep-1"])
        assertEquals(emptyMap<String, List<TimedLine>>(), PodcastTimings.decode("nope"))
    }
}

class SleepTimerTest {
    @Test
    fun `offers off 15 30 45 and end of episode`() {
        assertEquals(listOf("Off", "15 min", "30 min", "45 min", "End of episode"), SleepChoice.entries.map { it.label })
    }

    @Test
    fun `off never pauses`() {
        val s = SleepTimerState.start(SleepChoice.Off, 1000)
        assertNull(s.remainingMillis(9_999_999))
        assertFalse(s.shouldPause(9_999_999, false))
    }

    @Test
    fun `a timed choice pauses exactly at its deadline`() {
        val s = SleepTimerState.start(SleepChoice.Min15, 1000)
        assertEquals(900_000L, s.remainingMillis(1000))
        assertFalse(s.shouldPause(1000 + 900_000 - 1, false))
        assertTrue(s.shouldPause(1000 + 900_000, false))
    }

    @Test
    fun `30 and 45 use their own length`() {
        assertEquals(1_800_000L, SleepTimerState.start(SleepChoice.Min30, 0).remainingMillis(0))
        assertEquals(2_700_000L, SleepTimerState.start(SleepChoice.Min45, 0).remainingMillis(0))
    }

    @Test
    fun `remaining never goes below zero`() {
        assertEquals(0L, SleepTimerState.start(SleepChoice.Min15, 0).remainingMillis(99 * 60_000L))
    }

    @Test
    fun `end of episode ignores the clock`() {
        val s = SleepTimerState.start(SleepChoice.EndOfEpisode, 0)
        assertNull(s.remainingMillis(5))
        assertFalse(s.shouldPause(99 * 3_600_000L, false))
        assertTrue(s.shouldPause(0, true))
    }
}
