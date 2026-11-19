package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.ZoneId
import java.time.ZoneOffset

/**
 * The same cases as the iOS Kit's SyncReliabilityTests ("testTheServerStep…" and the displayed streak), so Android, iOS
 * and the web read a streak the way the server will treat it.
 */
class StreakDisplayTest {
    private val utc: ZoneId = ZoneOffset.UTC
    /** 2026-11-17 15:00 UTC, the iOS tests' `now`. */
    private val now = 1_794_927_600_000L

    private fun shown(streak: Int, last: String, freezes: Int?, basis: String? = "local", today: String = "2026-11-17") =
        StreakDisplay.shown(streak, last, freezes, basis, today)

    private fun next(streak: Int, longest: Int, last: String?, freezes: Int, basis: String?, today: String = "2026-11-17") =
        StreakRule.next(streak, longest, last, today, freezes, basis)

    // The server's step (computeStreakUpdate / local_days.sql), case by case.

    @Test
    fun `the server step on the same day changes nothing`() {
        assertEquals(StreakRule.Outcome(5, 8, 1, false), next(5, 8, "2026-11-17", 1, "local"))
        assertEquals(5, next(5, 8, "2026-11-18", 1, "local").streak, "a skewed future day is treated as today")
    }

    @Test
    fun `the server step on the next day adds one`() {
        assertEquals(StreakRule.Outcome(6, 6, 0, false), next(5, 5, "2026-11-16", 0, "local"))
    }

    @Test
    fun `the server step spends a freeze on one missed day`() {
        assertEquals(StreakRule.Outcome(6, 9, 1, true), next(5, 9, "2026-11-15", 2, "local"))
    }

    @Test
    fun `the server step restarts after one missed day without a freeze`() {
        assertEquals(StreakRule.Outcome(1, 9, 0, false), next(5, 9, "2026-11-15", 0, "local"))
    }

    @Test
    fun `the server step bridges the UTC day once without a freeze`() {
        assertEquals(StreakRule.Outcome(6, 6, 1, false), next(5, 5, "2026-11-15", 1, "utc"))
        assertTrue(StreakRule.bridgesUtcDay(null), "an unread basis is the server's default, utc")
    }

    @Test
    fun `the server step restarts after two missed days whatever the freezes`() {
        for (basis in listOf("local", "utc")) {
            assertEquals(StreakRule.Outcome(1, 12, 5, false), next(12, 12, "2026-11-14", 5, basis), basis)
        }
    }

    @Test
    fun `the server step earns a freeze on every tenth day`() {
        assertEquals(StreakRule.Outcome(10, 10, 1, false), next(9, 9, "2026-11-16", 0, "local"))
        assertEquals(StreakRule.Outcome(20, 20, 1, true), next(19, 19, "2026-11-15", 1, "local"))
    }

    @Test
    fun `the web's signature runs the same step`() {
        assertEquals(StreakResult(6, 6, 1), computeStreakUpdate(StreakInput("2026-11-15", "2026-11-17", 5, 5, 1, bridgeUtcDay = true)))
        assertEquals(StreakResult(6, 9, 1), computeStreakUpdate(StreakInput("2026-11-15", "2026-11-17", 5, 9, 2)))
    }

    // The displayed streak is that step's verdict.

    @Test
    fun `the streak reads normally when studied today or yesterday`() {
        assertEquals(StreakDisplay.Shown(12, StreakDisplay.State.ACTIVE), shown(12, "2026-11-17", 0))
        assertEquals(StreakDisplay.Shown(12, StreakDisplay.State.ACTIVE), shown(12, "2026-11-16", 0), "yesterday still counts: today is not over")
    }

    @Test
    fun `one missed day covered by a freeze reads as protected`() {
        assertEquals(StreakDisplay.Shown(12, StreakDisplay.State.PROTECTED), shown(12, "2026-11-15", 1))
        assertEquals("12-day streak, protected by a streak freeze", StreakDisplay.accessibilityLabel(shown(12, "2026-11-15", 1)))
        assertEquals("Streak: 1 day", StreakDisplay.accessibilityLabel(shown(1, "2026-11-17", 0)))
    }

    @Test
    fun `the UTC bridge reads as active, not protected`() {
        assertEquals(StreakDisplay.Shown(12, StreakDisplay.State.ACTIVE), shown(12, "2026-11-15", 0, basis = "utc"))
        assertEquals(StreakDisplay.Shown(12, StreakDisplay.State.ACTIVE), shown(12, "2026-11-15", 3, basis = null))
    }

    @Test
    fun `the streak reads zero when the server would restart it`() {
        assertEquals(StreakDisplay.Shown(0, StreakDisplay.State.LAPSED), shown(12, "2026-11-15", 0), "one missed, no freeze")
        assertEquals(StreakDisplay.Shown(0, StreakDisplay.State.LAPSED), shown(12, "2026-11-14", 5), "two missed: no freeze count saves it on the server")
        assertEquals(0, shown(12, "2026-11-15", null).streak, "an unknown freeze count protects nothing")
        assertEquals("Streak: 0 days", StreakDisplay.accessibilityLabel(shown(12, "2026-11-15", 0)))
    }

    @Test
    fun `the streak uses the learner's local day`() {
        // 15:00 UTC is already 2026-11-18 in Auckland (UTC+13), so the 16th is two days ago there: one missed day.
        val auckland = ZoneId.of("Pacific/Auckland")
        fun at(last: String, freezes: Int, zone: ZoneId) = StreakDisplay.shown(3, last, freezes, "local", now, zone).state
        assertEquals(StreakDisplay.State.LAPSED, at("2026-11-16", 0, auckland))
        assertEquals(StreakDisplay.State.PROTECTED, at("2026-11-16", 1, auckland))
        assertEquals(StreakDisplay.State.ACTIVE, at("2026-11-17", 0, auckland))
        // In Los Angeles (UTC-8) it is still 07:00 on the 17th: the 16th is yesterday.
        val losAngeles = ZoneId.of("America/Los_Angeles")
        assertEquals(StreakDisplay.State.ACTIVE, at("2026-11-16", 0, losAngeles))
        assertEquals(StreakDisplay.State.LAPSED, at("2026-11-15", 0, losAngeles))
    }

    @Test
    fun `the day changes at local midnight`() {
        val utcMidnight18th = 1_794_960_000_000L // 2026-11-18 00:00 UTC
        fun at(millis: Long) = StreakDisplay.shown(4, "2026-11-16", 0, "local", millis, utc).state
        assertEquals(StreakDisplay.State.ACTIVE, at(utcMidnight18th - 1_000))
        assertEquals(StreakDisplay.State.LAPSED, at(utcMidnight18th))
    }

    // The widget reads its stored snapshot as of the moment it draws.

    @Test
    fun `the widget snapshot reads the streak as of when it is drawn`() {
        val written = makeStreakWidgetSnapshot(7, 9, "2026-11-17", now, utc, streakFreezes = 1, dayBasis = "local")
        assertEquals(7, written.streak)
        assertTrue(written.studiedToday)
        assertFalse(written.isStreakProtected)
        val day = 24L * 60 * 60 * 1000
        val twoDaysOn = written.asOf(now + 2 * day, utc)
        assertEquals(7, twoDaysOn.streak, "one missed day, covered by the freeze")
        assertTrue(twoDaysOn.isStreakProtected)
        assertFalse(twoDaysOn.studiedToday)
        val threeDaysOn = written.asOf(now + 3 * day, utc)
        assertEquals(0, threeDaysOn.streak, "two missed days: the run is over")
        assertFalse(threeDaysOn.isStreakProtected)
    }

    @Test
    fun `a snapshot from before the fields existed keeps its number`() {
        val old = StreakWidgetSnapshot(4, 12, studiedToday = false, updatedAtMillis = now)
        assertEquals(4, old.asOf(now + 10L * 24 * 60 * 60 * 1000, utc).streak)
    }
}
