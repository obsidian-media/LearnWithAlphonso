package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.Achievement
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class AchievementPresentationTest {
    private fun a(id: String, category: String, threshold: Int) = Achievement(id, id, "", "flame", "bronze", category, threshold)

    @Test
    fun `an unlocked badge is unlocked whatever its progress, a locked one is in reach only with some progress`() {
        assertEquals(AchievementPresentation.State.UNLOCKED, AchievementPresentation.state(true, 0))
        assertEquals(AchievementPresentation.State.IN_REACH, AchievementPresentation.state(false, 1))
        assertEquals(AchievementPresentation.State.LOCKED, AchievementPresentation.state(false, 0))
        assertEquals(AchievementPresentation.State.LOCKED, AchievementPresentation.state(false, -3))
    }

    @Test
    fun `the summary and tier read as the other platforms do`() {
        assertEquals("7 of 25 unlocked", AchievementPresentation.summary(7, 25))
        assertEquals("Gold", AchievementPresentation.tierLabel("gold"))
        assertEquals("Platinum", AchievementPresentation.tierLabel("platinum"))
    }

    @Test
    fun `progress is a fraction held between zero and one`() {
        assertEquals(0.4f, AchievementPresentation.fraction(12, 30), 0.0001f)
        assertEquals(1f, AchievementPresentation.fraction(31, 30), 0.0001f)
        assertEquals(0f, AchievementPresentation.fraction(-1, 30), 0.0001f)
        assertEquals(0f, AchievementPresentation.fraction(5, 0), 0.0001f)
    }

    @Test
    fun `the progress words never pass the threshold and the percent rounds down`() {
        assertEquals("12 of 30", AchievementPresentation.progressLine(12, 30))
        assertEquals("30 of 30", AchievementPresentation.progressLine(31, 30))
        assertEquals("0 of 30", AchievementPresentation.progressLine(-4, 30))
        assertEquals("40%", AchievementPresentation.percentLabel(12, 30))
        assertEquals("99%", AchievementPresentation.percentLabel(199, 200))
    }

    @Test
    fun `a ladder is the family in threshold order and a lone badge has none`() {
        val catalog = listOf(a("streak_30", "streak", 30), a("xp_100", "xp", 100), a("streak_3", "streak", 3), a("streak_7", "streak", 7))
        assertEquals(listOf("streak_3", "streak_7", "streak_30"), AchievementPresentation.ladder(catalog, "streak").map { it.id })
        assertEquals("Streak ladder", AchievementPresentation.ladderTitle("streak", 3))
        assertNull(AchievementPresentation.ladderTitle("team", 1))
    }

    @Test
    fun `the medallion drawable is named after the achievement id`() {
        assertEquals("badge_streak_7", AchievementPresentation.medallionName("streak_7"))
        assertEquals("badge_team_player", AchievementPresentation.medallionName("team_player"))
    }
}
