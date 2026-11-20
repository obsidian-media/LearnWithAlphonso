package com.obsidianmedia.learnwithalphonso.core.profile

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The identity hero, week strip and league card rules: the same vectors as ProfileHeroTests.swift and profile-overview.test.ts. */
class ProfileHeroTest {
    private val m = ProfileMath
    private val today = "2026-11-06" // a Friday

    @Test
    fun `league pct is the share through this tiers span and stays in range`() {
        // sapling spans 300 to 1000 XP: 650 is halfway.
        assertEquals(50, m.leaguePct("silver", 650))
        assertEquals(0, m.leaguePct("bronze", 0))
        assertEquals(100, m.leaguePct("diamond", 9000))
        assertEquals(100, m.leaguePct("silver", 5000))
        assertEquals(0, m.leaguePct("silver", 10))
    }

    @Test
    fun `lessons left is the levels lessons not yet done`() {
        val p = m.levelProgress("A2", listOf(listOf("a", "b"), listOf("c", "d")), setOf("a", "b", "c"))
        assertEquals(1, m.lessonsLeft(p))
        assertEquals(0, m.lessonsLeft(m.levelProgress("A1", emptyList(), emptySet())))
    }

    @Test
    fun `week strip stamps done days rings today and leaves the rest plain`() {
        val strip = m.weekStrip(
            today, listOf(ProfileActivityDay("2026-11-02", 40), ProfileActivityDay("2026-11-04", 20)),
            emptyList(), emptyList(), null,
        )
        assertFalse(strip.measuredInMinutes)
        assertEquals(
            listOf(
                ProfileMath.RingState.DONE, ProfileMath.RingState.MISSED, ProfileMath.RingState.DONE, ProfileMath.RingState.MISSED,
                ProfileMath.RingState.TODAY, ProfileMath.RingState.FUTURE, ProfileMath.RingState.FUTURE,
            ),
            strip.days.map { it.state },
        )
        assertEquals(2, strip.doneDays)
        assertEquals("40 XP", strip.days[0].spoken)
        assertEquals("not yet today", strip.days[4].spoken)
        assertEquals("still to come", strip.days[6].spoken)
    }

    @Test
    fun `week strip measures learning minutes when the learner chose a goal`() {
        val strip = m.weekStrip(
            today, listOf(ProfileActivityDay("2026-11-03", 90)), emptyList(),
            listOf(ProfileLearningDay("2026-11-02", 420, 240)), 10,
        )
        assertTrue(strip.measuredInMinutes)
        // XP alone does not make a day done once a goal exists; 11 minutes on Monday does.
        assertEquals(ProfileMath.RingState.DONE, strip.days[0].state)
        assertEquals("11 min, goal met", strip.days[0].spoken)
        assertEquals(ProfileMath.RingState.MISSED, strip.days[1].state)
        assertEquals(1, strip.doneDays)
    }

    @Test
    fun `a country without a drawing falls back to null never to the emoji`() {
        assertEquals("GB", m.drawnFlagCode("gb"))
        assertEquals("CA", m.drawnFlagCode("ca"))
        assertNull(m.drawnFlagCode("ZA"))
        assertNull(m.drawnFlagCode(null))
    }
}
