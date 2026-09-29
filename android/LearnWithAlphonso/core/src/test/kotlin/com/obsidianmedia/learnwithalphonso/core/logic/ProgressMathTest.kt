package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** Vectors copied from src/lib/progress-math.test.ts, plus the UTC pin from the plan's Review Focus 3. */
class ProgressMathTest {
    @Test
    fun `xp gain is ten per correct plus a perfect bonus`() {
        assertEquals(30, computeXpGain(3, 5))
        assertEquals(70, computeXpGain(5, 5))
        assertEquals(0, computeXpGain(0, 6))
    }

    private fun streak(
        last: String?,
        streak: Int = 4,
        longest: Int = 10,
        freezes: Int = 1,
        today: String = "2026-09-13",
    ) = computeStreakUpdate(StreakInput(last, today, streak, longest, freezes))

    @Test
    fun `same day leaves everything unchanged`() {
        assertEquals(StreakResult(4, 10, 1), streak("2026-09-13"))
    }

    @Test
    fun `first ever activity starts at one`() {
        val r = streak(null)
        assertEquals(1, r.streak)
        assertEquals(1, r.freezes)
    }

    @Test
    fun `consecutive day extends`() {
        val r = streak("2026-09-12")
        assertEquals(5, r.streak)
        assertEquals(10, r.longestStreak)
    }

    @Test
    fun `a missed day is bridged by a freeze`() {
        val r = streak("2026-09-11")
        assertEquals(5, r.streak)
        assertEquals(0, r.freezes)
    }

    @Test
    fun `a missed day without a freeze resets`() {
        assertEquals(1, streak("2026-09-11", freezes = 0).streak)
    }

    @Test
    fun `a wide gap resets regardless of freezes`() {
        assertEquals(1, streak("2026-09-01").streak)
    }

    @Test
    fun `longest streak rises with the streak`() {
        assertEquals(11, streak("2026-09-12", streak = 10, longest = 10).longestStreak)
    }

    @Test
    fun `a bonus freeze arrives on every tenth day`() {
        val r = streak("2026-09-12", streak = 9, longest = 9, freezes = 0)
        assertEquals(10, r.streak)
        assertEquals(1, r.freezes)
    }

    @Test
    fun `no freeze when resetting near a milestone`() {
        val r = streak("2026-09-01", streak = 9, longest = 9, freezes = 0)
        assertEquals(1, r.streak)
        assertEquals(0, r.freezes)
    }

    @Test
    fun `date diff is computed on ISO dates and today is derived in UTC`() {
        // 23:30 in UTC-8 on Sep 12 is 07:30 UTC on Sep 13; the app must hand the
        // UTC date to the streak logic so yesterday reads as a 1-day gap.
        assertEquals("2026-09-13", utcDateString(1789284600000L)) // 2026-09-13T07:30:00Z
        assertEquals(5, streak("2026-09-12", today = utcDateString(1789284600000L)).streak)
    }

    @Test
    fun `league promotion never demotes`() {
        assertEquals(LeaguePromotion("bronze", 0), computeLeaguePromotion(50, 0))
        assertEquals(LeaguePromotion("ruby", 3), computeLeaguePromotion(3200, 0))
        assertEquals(LeaguePromotion("diamond", 4), computeLeaguePromotion(8000, 0))
        assertEquals(LeaguePromotion("diamond", 4), computeLeaguePromotion(0, 4))
    }

    @Test
    fun `replay xp only pays the improvement over the best`() {
        assertEquals(LessonReplayXp(5, 70, 70), computeLessonReplayXp(null, 5, 5))
        assertEquals(LessonReplayXp(5, 70, 0), computeLessonReplayXp(5 to 70, 5, 5))
        assertEquals(LessonReplayXp(5, 70, 0), computeLessonReplayXp(5 to 70, 2, 5))
        assertEquals(LessonReplayXp(5, 70, 50), computeLessonReplayXp(2 to 20, 5, 5))
        assertEquals(LessonReplayXp(5, 70, 0), computeLessonReplayXp(5 to 999, 5, 5))
    }
}
