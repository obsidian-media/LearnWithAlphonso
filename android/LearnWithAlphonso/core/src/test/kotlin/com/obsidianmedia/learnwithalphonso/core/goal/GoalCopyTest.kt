package com.obsidianmedia.learnwithalphonso.core.goal

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.Instant

/** The wording must match the web card (src/components/GoalCard.tsx) and iOS GoalCopy; change all three together. */
class GoalCopyTest {
    private fun plan(
        status: GoalStatus = GoalStatus.ON_TRACK,
        realism: GoalRealism = GoalRealism.OK,
        required: Int = 10,
        recent: Int = 10,
        inScope: Int = 30,
        remaining: Int = 20,
        suggested: String? = null,
    ) = GoalPlan("A1", "B1", "2026-12-01", inScope, remaining, recent, required, status, realism, suggested, "2026-10-06T12:00:00.000Z")

    private fun at(y: Int, m: Int, d: Int): Instant = Instant.parse("%04d-%02d-%02dT12:00:00Z".format(y, m, d))

    @Test
    fun `formatDate is a fixed English day month year in UTC`() {
        assertEquals("10 Nov 2026", GoalCopy.formatDate("2026-11-10"))
        assertEquals("5 Sep 2026", GoalCopy.formatDate("2026-09-05"))
        assertEquals("1 Jan 2027", GoalCopy.formatDate("2027-01-01"))
        assertEquals("not a date", GoalCopy.formatDate("not a date"))
        assertEquals("2026-13-40", GoalCopy.formatDate("2026-13-40"))
        // A day the month does not have must not roll over into the next month.
        assertEquals("2026-02-30", GoalCopy.formatDate("2026-02-30"))
    }

    @Test
    fun `headline and progress`() {
        val goal = StoredGoal("en", "B1", "2026-12-01", "x")
        assertEquals("Finish B1 by 1 Dec 2026", GoalCopy.headline(goal))
        assertEquals("10 of 30 lessons done", GoalCopy.progress(plan(inScope = 30, remaining = 20)))
    }

    @Test
    fun `status lines match the web card`() {
        assertEquals("Goal reached.", GoalCopy.statusLine(GoalStatus.DONE))
        assertEquals("The date has passed. Pick a new date to keep going.", GoalCopy.statusLine(GoalStatus.EXPIRED))
        assertEquals("Just started. Check back next week.", GoalCopy.statusLine(GoalStatus.JUST_STARTED))
        assertEquals("Ahead of plan.", GoalCopy.statusLine(GoalStatus.AHEAD))
        assertEquals("On track.", GoalCopy.statusLine(GoalStatus.ON_TRACK))
        assertEquals("Behind plan.", GoalCopy.statusLine(GoalStatus.BEHIND))
        assertFalse(GoalCopy.statusLine(GoalStatus.UNKNOWN).isEmpty())
    }

    @Test
    fun `the weekly line is hidden when done or expired`() {
        assertEquals(
            "13 lessons a week to finish on time; 5 in the last 7 days.",
            GoalCopy.weeklyLine(plan(status = GoalStatus.BEHIND, required = 13, recent = 5)),
        )
        assertNull(GoalCopy.weeklyLine(plan(status = GoalStatus.DONE)))
        assertNull(GoalCopy.weeklyLine(plan(status = GoalStatus.EXPIRED)))
    }

    @Test
    fun `the preview lines are the bare weekly number and what is left`() {
        val lines = GoalCopy.previewLines(plan(required = 12, remaining = 20))
        assertEquals("12 lessons a week", lines.perWeek)
        assertEquals("20 lessons left to finish B1.", lines.left)
    }

    @Test
    fun `the suggestion appears whenever the server sent one`() {
        assertEquals("At your recent pace, 10 Nov 2026 is realistic.", GoalCopy.suggestionLine(plan(status = GoalStatus.BEHIND, suggested = "2026-11-10")))
        assertEquals("At your recent pace, 12 Jan 2027 is realistic.", GoalCopy.suggestionLine(plan(status = GoalStatus.EXPIRED, suggested = "2027-01-12")))
        assertNull(GoalCopy.suggestionLine(plan(status = GoalStatus.BEHIND, suggested = null)))
    }

    @Test
    fun `realism lines never repeat the suggestion`() {
        assertNull(GoalCopy.realismLine(plan(realism = GoalRealism.OK)))
        assertNull(GoalCopy.realismLine(plan(realism = GoalRealism.UNKNOWN)))
        assertEquals("Ambitious: about two lessons a day or more.", GoalCopy.realismLine(plan(realism = GoalRealism.AMBITIOUS)))
        assertEquals(
            "Unrealistic for most learners at this date.",
            GoalCopy.realismLine(plan(realism = GoalRealism.UNREALISTIC, suggested = "2026-11-10")),
        )
    }

    @Test
    fun `offline with nothing cached does not promise a plan`() {
        assertEquals(LearningGoalError.Offline.userMessage, GoalCopy.loadFailureMessage(LearningGoalError.Offline, hadCachedPlan = true))
        assertEquals("You're offline. Connect to load your goal.", GoalCopy.loadFailureMessage(LearningGoalError.Offline, hadCachedPlan = false))
        assertEquals(LearningGoalError.Unavailable.userMessage, GoalCopy.loadFailureMessage(LearningGoalError.Unavailable, hadCachedPlan = false))
        assertEquals(LearningGoalError.NotSignedIn.userMessage, GoalCopy.loadFailureMessage(LearningGoalError.NotSignedIn, hadCachedPlan = true))
    }

    @Test
    fun `a failed action never says it is showing a plan`() {
        assertEquals("You're offline. Try again when you're connected.", GoalCopy.actionFailureMessage(LearningGoalError.Offline))
        assertEquals(LearningGoalError.Unavailable.userMessage, GoalCopy.actionFailureMessage(LearningGoalError.Unavailable))
        assertEquals(LearningGoalError.NotSignedIn.userMessage, GoalCopy.actionFailureMessage(LearningGoalError.NotSignedIn))
        assertEquals("That level is below yours", GoalCopy.actionFailureMessage(LearningGoalError.Invalid("That level is below yours")))
    }

    @Test
    fun `the estimate note`() {
        assertEquals("An estimate of lessons, not of fluency.", GoalCopy.ESTIMATE_NOTE)
    }

    @Test
    fun `month presets clamp to the end of a shorter month`() {
        assertEquals("2027-04-06", GoalCopy.monthsFromToday(6, at(2026, 10, 6)))
        assertEquals("2027-02-28", GoalCopy.monthsFromToday(6, at(2026, 8, 31)))
        assertEquals("2027-02-28", GoalCopy.monthsFromToday(3, at(2026, 11, 30)))
        assertEquals("2028-02-28", GoalCopy.monthsFromToday(12, at(2027, 2, 28)))
        assertEquals("2028-03-31", GoalCopy.monthsFromToday(12, at(2027, 3, 31)))
        // Leap day: 29 Feb 2028 + 12 months has no 29 Feb in 2029.
        assertEquals("2029-02-28", GoalCopy.monthsFromToday(12, at(2028, 2, 29)))
    }

    @Test
    fun `tomorrow is the next UTC day`() {
        assertEquals("2026-10-07", GoalCopy.tomorrow(at(2026, 10, 6)))
        assertEquals("2027-01-01", GoalCopy.tomorrow(at(2026, 12, 31)))
        // 23:30 UTC is still the 6th, whatever the device time zone is.
        assertEquals("2026-10-07", GoalCopy.tomorrow(Instant.parse("2026-10-06T23:30:00Z")))
    }

    @Test
    fun `day conversions are UTC, noon based and round trip`() {
        assertEquals("2026-10-06", GoalCopy.dayOf(at(2026, 10, 6).toEpochMilli()))
        assertEquals("2026-10-05", GoalCopy.dayOf(Instant.parse("2026-10-05T23:30:00Z").toEpochMilli()))
        val millis = GoalCopy.millisOfDay("2027-02-28")!!
        assertEquals("2027-02-28", GoalCopy.dayOf(millis))
        // Noon UTC, so a picker in any time zone (up to +-12h) shows the same calendar day.
        assertEquals(43_200_000L, millis % 86_400_000L)
        assertNull(GoalCopy.millisOfDay("2027-02-30"))
        assertNull(GoalCopy.millisOfDay("soon"))
    }
}
