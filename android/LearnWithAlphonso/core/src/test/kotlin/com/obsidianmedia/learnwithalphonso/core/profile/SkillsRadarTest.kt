package com.obsidianmedia.learnwithalphonso.core.profile

import com.obsidianmedia.learnwithalphonso.core.profile.ProfileMath.RingState
import com.obsidianmedia.learnwithalphonso.core.profile.SkillsRadar.MIN_SKILL_ANSWERS
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The same vectors as src/lib/skills-radar.test.ts and the goalRings tests in profile-overview.test.ts. */
class SkillsRadarTest {
    private val today = "2026-11-06"
    private fun row(skill: String, right: Int, total: Int) = ProfileSkillDay("2026-11-05", skill, right, total)
    private fun model(rows: List<ProfileSkillDay>) = SkillsRadar.radarModel(ProfileMath.skillScores(rows, today))

    @Test
    fun `not ready with no answers, nothing invented`() {
        val m = model(emptyList())
        assertFalse(m.ready)
        assertEquals(listOf(null, null, null, null, null), m.skills.map { it.pct })
    }

    @Test
    fun `a skill under the minimum answers is unscored and says how many more it needs`() {
        val s = model(listOf(row("listening", 4, MIN_SKILL_ANSWERS - 1))).skills.first { it.skill == "listening" }
        assertNull(s.pct)
        assertEquals(1, s.needed)
    }

    @Test
    fun `needs three scored skills then names the lowest`() {
        assertFalse(model(listOf(row("listening", 9, 10), row("grammar", 4, 10))).ready)
        val three = model(listOf(row("listening", 9, 10), row("grammar", 4, 10), row("reading", 8, 10)))
        assertTrue(three.ready)
        assertEquals("grammar", three.lowest?.skill)
    }

    @Test
    fun `axis 0 points straight up and the polygon has one vertex per scored skill`() {
        assertEquals(Pair(150.0, 50.0), SkillsRadar.radarPoint(0, 5, 100.0, 150.0))
        val m = model(listOf(row("listening", 10, 10), row("grammar", 5, 10), row("reading", 10, 10)))
        val poly = SkillsRadar.radarPolygon(m.skills, 100.0, 150.0)
        assertEquals(3, poly.size)
        assertEquals(Pair(150.0, 50.0), poly[0])
    }

    private val learning = listOf(
        ProfileLearningDay("2026-11-02", 420, 240),
        ProfileLearningDay("2026-11-03", 300, 0),
    )

    @Test
    fun `goal rings - a day is done when minutes reach the goal and today is open until then`() {
        val g = ProfileMath.goalRings("2026-11-04", learning, 10)
        assertEquals(
            listOf(RingState.DONE, RingState.MISSED, RingState.TODAY, RingState.FUTURE, RingState.FUTURE, RingState.FUTURE, RingState.FUTURE),
            g.days.map { it.state },
        )
        assertEquals(11, g.days[0].minutes)
        assertEquals(1, g.metDays)
    }

    @Test
    fun `goal rings - a bigger goal is not met by the same minutes`() {
        assertEquals(0, ProfileMath.goalRings("2026-11-04", learning, 15).metDays)
    }

    @Test
    fun `league week end is shown in the learner's zone, invalid or null falls back to UTC`() {
        assertEquals("ends Mon, Nov 9", ProfileMath.leagueWeekEnds("2026-11-08", "Europe/Paris"))
        assertEquals("ends Sun, Nov 8", ProfileMath.leagueWeekEnds("2026-11-08", "America/New_York"))
        assertEquals("ends Sun, Nov 8", ProfileMath.leagueWeekEnds("2026-11-08", "Not/AZone"))
        assertEquals("ends Sun, Nov 8", ProfileMath.leagueWeekEnds("2026-11-08", null))
    }
}
