package com.obsidianmedia.learnwithalphonso.core.profile

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ProfileDataMathTest {
    private val today = "2026-11-07"

    @Test
    fun `the window keeps 28 days back and drops the 29th`() {
        val rows = listOf(
            ProfileSkillDay(ProfileMath.addDays(today, -27), "listening", 1, 1),
            ProfileSkillDay(ProfileMath.addDays(today, -28), "listening", 0, 10),
            ProfileSkillDay(ProfileMath.addDays(today, 1), "listening", 0, 10),
        )
        val listening = ProfileMath.skillScores(rows, today).first()
        assertEquals(1, listening.answered)
        assertEquals(100, listening.pct)
    }

    @Test
    fun `an untrained skill has null pct and the five skills are always in order`() {
        val scores = ProfileMath.skillScores(listOf(ProfileSkillDay(today, "grammar", 1, 2)), today)
        assertEquals(listOf("listening", "speaking", "vocabulary", "grammar", "reading"), scores.map { it.skill })
        assertNull(scores[0].pct)
        assertEquals(0, scores[0].answered)
        assertEquals(50, scores[3].pct)
        assertEquals(5, ProfileMath.skillScores(emptyList(), today).size)
    }

    @Test
    fun `pct rounds half up and sums across days`() {
        val rows = listOf(ProfileSkillDay(today, "reading", 1, 8), ProfileSkillDay(ProfileMath.addDays(today, -1), "reading", 0, 0))
        assertEquals(13, ProfileMath.skillScores(rows, today)[4].pct) // 12.5 -> 13
        val two = listOf(ProfileSkillDay(today, "speaking", 1, 3), ProfileSkillDay(ProfileMath.addDays(today, -2), "speaking", 1, 3))
        assertEquals(33, ProfileMath.skillScores(two, today)[1].pct)
        assertEquals(2, ProfileMath.skillScores(two, today)[1].let { it.answered / 3 })
    }

    @Test
    fun `a custom window is honoured`() {
        val rows = listOf(ProfileSkillDay(ProfileMath.addDays(today, -7), "reading", 1, 1))
        assertNull(ProfileMath.skillScores(rows, today, 7)[4].pct)
        assertEquals(100, ProfileMath.skillScores(rows, today, 8)[4].pct)
    }

    @Test
    fun `learning minutes floor the summed seconds of that day only`() {
        val rows = listOf(
            ProfileLearningDay(today, 90, 29), // 119 s
            ProfileLearningDay("2026-11-06", 6000, 0),
        )
        assertEquals(1, ProfileMath.learningMinutes(rows, today))
        assertEquals(2, ProfileMath.learningMinutes(listOf(ProfileLearningDay(today, 90, 30)), today))
        assertEquals(0, ProfileMath.learningMinutes(rows, "2026-11-08"))
    }

    @Test
    fun `the daily goal is reached exactly at the goal and never for a zero goal`() {
        val rows = listOf(ProfileLearningDay(today, 300, 0))
        assertTrue(ProfileMath.dailyGoalProgress(rows, today, 5).reached)
        assertFalse(ProfileMath.dailyGoalProgress(rows, today, 6).reached)
        assertFalse(ProfileMath.dailyGoalProgress(emptyList(), today, 0).reached)
        assertEquals(ProfileMath.DailyGoal(5, 5, true), ProfileMath.dailyGoalProgress(rows, today, 5))
    }
}
