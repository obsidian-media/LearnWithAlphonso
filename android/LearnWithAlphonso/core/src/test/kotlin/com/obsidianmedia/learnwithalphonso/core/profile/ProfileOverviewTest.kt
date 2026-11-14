package com.obsidianmedia.learnwithalphonso.core.profile

import com.obsidianmedia.learnwithalphonso.core.content.Achievement
import com.obsidianmedia.learnwithalphonso.core.net.FriendProgress
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** The same vectors as ios/LearnWithAlphonsoKit ProfileOverviewTests.swift. */
class ProfileOverviewTest {
    private val m = ProfileMath
    private val today = "2026-11-07" // a Saturday

    @Test
    fun `free teaser uses only own weak spots never Hector memory`() {
        val weak = listOf(ProfileWeakItem("a", "ser and estar", 3, 0))
        val events = listOf(ProfileWeaknessEvent("secret-memory-topic", "detected", "2026-11-01"))
        assertEquals(ProfileMath.HectorCard.Teaser(listOf("ser and estar")), m.hectorCard(false, weak, events))
    }

    @Test
    fun `free with no weak spots has no card even when memory exists`() {
        val events = listOf(ProfileWeaknessEvent("past-tense", "detected", "2026-11-01"))
        assertNull(m.hectorCard(false, emptyList(), events))
    }

    @Test
    fun `pro reads open memory topics`() {
        val events = listOf(
            ProfileWeaknessEvent("past-tense", "detected", "2026-11-01"),
            ProfileWeaknessEvent("gender", "detected", "2026-11-02"),
            ProfileWeaknessEvent("gender", "resolved", "2026-11-03"),
        )
        assertEquals(ProfileMath.HectorCard.Pro(listOf("past tense")), m.hectorCard(true, emptyList(), events))
        assertNull(m.hectorCard(true, emptyList(), emptyList()))
    }

    @Test
    fun `flag hidden when off and shown when on`() {
        assertNull(m.flagEmoji(null))
        assertNull(m.flagEmoji("ES", showFlag = false))
        assertNull(m.flagEmoji("x1"))
        assertEquals("🇪🇸", m.flagEmoji("es"))
    }

    @Test
    fun `leaderboard flag is drawn only for a learner who turned it on`() {
        // profiles.country is set only while the flag is on, so a country is the consent signal.
        assertEquals("🇨🇦", m.flagEmoji("CA"))
        assertEquals("🇳🇱", m.flagEmoji("nl"))
        assertNull(m.flagEmoji(null))
        assertNull(m.flagEmoji(""))
        assertNull(m.flagEmoji("CAN"))
        assertNull(m.flagEmoji("CA", showFlag = false))
    }

    @Test
    fun `leaderboard flag keeps the code for screen readers`() {
        assertEquals("Country CA", m.flagAccessibilityLabel("ca"))
        assertNull(m.flagAccessibilityLabel(null))
        assertNull(m.flagAccessibilityLabel("C1"))
    }

    @Test
    fun `heat map spans exactly three months of UTC days`() {
        assertEquals("2026-08-08", m.threeMonthsWindow("2026-11-07").first)
        assertEquals("2026-03-01", m.threeMonthsWindow("2026-05-31").first) // Feb clamps to the 28th
        val inRange = m.heatMap(today, emptyList()).weeks.flatten().filter { it.inRange }
        assertEquals(92, inRange.size)
        assertEquals("2026-08-08", inRange.first().day)
        assertEquals(today, inRange.last().day)
    }

    @Test
    fun `xp is this course only and the current streak not the longest is the big number`() {
        val o = ProfileOverviewData(
            today = today, course = "es", streak = 4, longestStreak = 40,
            courses = listOf(ProfileCourseProgress("en", 900, "A1", "silver"), ProfileCourseProgress("es", 120, "A2", "bronze")),
            completions = listOf(ProfileCompletion("l1", "es", 4, 5), ProfileCompletion("l2", "en", 5, 5)),
        )
        val b = m.bigNumbers(o) { listOf("hola") }
        assertEquals(120, b.courseXp)
        assertEquals(4, b.streak)
        assertEquals(40, b.longestStreak)
        assertEquals(1, b.lessonsDone)
        assertEquals(80, b.accuracyPct)
    }

    @Test
    fun `week rings mark done missed today and future and sum minutes`() {
        val w = m.weekRings(
            today, listOf(ProfileActivityDay("2026-11-02", 10), ProfileActivityDay("2026-11-06", 5)),
            listOf(ProfileSpeechDay("2026-11-02", 90), ProfileSpeechDay("2026-11-06", 30)),
        )
        assertEquals(listOf("2026-11-02", "2026-11-08"), listOf(w.days.first().day, w.days.last().day))
        assertEquals(ProfileMath.RingState.DONE, w.days[0].state)
        assertEquals(ProfileMath.RingState.MISSED, w.days[1].state)
        assertEquals(ProfileMath.RingState.TODAY, w.days[5].state)
        assertEquals(ProfileMath.RingState.FUTURE, w.days[6].state)
        assertEquals(2, w.activeDays)
        assertEquals(2, w.minutesSpoken)
    }

    @Test
    fun `next achievement is the closest locked one and never team`() {
        val catalog = listOf(
            Achievement("a", "A", "d", "i", "bronze", "streak", 10),
            Achievement("b", "B", "d", "i", "bronze", "streak", 5),
            Achievement("t", "T", "d", "i", "gold", "team", 1),
        )
        assertEquals("b", m.nextAchievement(mapOf("streak" to 4), emptySet(), catalog)?.first?.id)
        assertEquals("a", m.nextAchievement(mapOf("streak" to 4), setOf("b"), catalog)?.first?.id)
    }

    @Test
    fun `league status counts xp to the next tier and friends board keeps you`() {
        val s = m.leagueStatus("bronze", 100)
        assertEquals("silver", s.next)
        assertEquals(200, s.xpToNext)
        assertNull(m.leagueStatus("diamond", 99999).next)
        val friends = (1..6).map { FriendProgress("f$it", "F$it", "0", 1, 100 - it) }
        val rows = m.friendsWeek(friends, "Me", "0", 0)
        assertEquals(5, rows.size)
        assertEquals(true, rows.last().isYou)
    }

    @Test
    fun `share card has no link`() {
        val lines = m.shareCardLines("Ada", "English", "A2", 3, 1, 50)
        assertEquals(false, lines.any { it.contains("http") || it.contains(".app") })
        assertEquals("minute spoken", lines[6])
    }
}
