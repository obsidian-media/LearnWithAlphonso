package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The state mapping behind the redesigned Duels, League, Teams and Build my path screens (parity with SocialPresentationTests.swift). */
class SocialPresentationTest {
    @Test
    fun `the duels summary names only the parts that are not zero`() {
        assertEquals("1 pending · 1 active · 3 finished", DuelsPresentation.summary(1, 1, 3))
        assertEquals("2 active", DuelsPresentation.summary(0, 2, 0))
        assertEquals("4 finished", DuelsPresentation.summary(0, 0, 4))
        assertNull(DuelsPresentation.summary(0, 0, 0))
    }

    @Test
    fun `the share is the learners portion of the XP earned`() {
        assertEquals(120f / 215f, DuelsPresentation.share(120, 95), 0.0001f)
        assertEquals(0f, DuelsPresentation.share(0, 40), 0.0001f)
        assertEquals(1f, DuelsPresentation.share(40, 0), 0.0001f)
    }

    @Test
    fun `the share is even when nobody has earned anything and never negative`() {
        assertEquals(0.5f, DuelsPresentation.share(0, 0), 0.0001f)
        assertEquals(0f, DuelsPresentation.share(-5, 10), 0.0001f)
        assertEquals(1f, DuelsPresentation.share(10, -5), 0.0001f)
    }

    @Test
    fun `a finished duel reads as won lost tied or declined for this learner`() {
        assertEquals(DuelsPresentation.Result("You won", DuelsPresentation.ResultTone.WON), DuelsPresentation.result("completed", "me", "me"))
        assertEquals(DuelsPresentation.Result("You lost", DuelsPresentation.ResultTone.LOST), DuelsPresentation.result("completed", "them", "me"))
        assertEquals(DuelsPresentation.Result("Tied", DuelsPresentation.ResultTone.TIED), DuelsPresentation.result("completed", null, "me"))
        // Declined wins over a stray winner on the row.
        assertEquals(DuelsPresentation.Result("Declined", DuelsPresentation.ResultTone.DECLINED), DuelsPresentation.result("declined", "me", "me"))
    }

    @Test
    fun `a winner is never the learner when the learner is unknown`() {
        assertEquals(DuelsPresentation.ResultTone.LOST, DuelsPresentation.result("completed", "x", null).tone)
    }

    @Test
    fun `only the top three ranks get a medal`() {
        assertEquals(DsRankMedal.GOLD, LeaguePresentation.medal(1))
        assertEquals(DsRankMedal.SILVER, LeaguePresentation.medal(2))
        assertEquals(DsRankMedal.BRONZE, LeaguePresentation.medal(3))
        assertNull(LeaguePresentation.medal(4))
        assertNull(LeaguePresentation.medal(0))
    }

    @Test
    fun `the league title uses the tier display name`() {
        assertEquals("Treetop league", LeaguePresentation.tierTitle("ruby"))
        assertEquals("Sprout league", LeaguePresentation.tierTitle("bronze"))
        assertNull(LeaguePresentation.tierTitle(null))
        assertNull(LeaguePresentation.tierTitle(""))
    }

    @Test
    fun `every tier key has the display name the web and iOS use`() {
        assertEquals(listOf("Sprout", "Sapling", "Grove", "Treetop", "Summit"), listOf("bronze", "silver", "sapphire", "ruby", "diamond").map { LeagueTierCopy.label(it) })
        assertEquals("Mystery", LeagueTierCopy.label("mystery"))
    }

    @Test
    fun `the goal chips are the purpose the level and the date`() {
        assertEquals(listOf("Travel", "Finish B1", "by 10 May 2027"), PathGoalChips.labels("travel", "B1", "2027-05-10"))
    }

    @Test
    fun `an unknown or missing purpose leaves it out rather than inventing one`() {
        for (purpose in listOf(null, "", "teleport")) {
            val chips = PathGoalChips.labels(purpose, "A2", "2027-01-02")
            assertEquals(2, chips.size)
            assertEquals("Finish A2", chips.first())
        }
    }

    @Test
    fun `join and create need something typed`() {
        assertFalse(TeamsPresentation.canJoin(""))
        assertFalse(TeamsPresentation.canJoin("   "))
        assertTrue(TeamsPresentation.canJoin("K7MQ2X"))
        assertFalse(TeamsPresentation.canCreate(" \n"))
        assertTrue(TeamsPresentation.canCreate("Night Owls"))
    }
}

class ReviewPresentationTest {
    @Test
    fun `each queue situation maps to its own screen`() {
        assertEquals(ReviewPresentation.Screen.LOADING, ReviewPresentation.screen(isLoading = true, hasError = true, queueSize = 3, isDone = true))
        assertEquals(ReviewPresentation.Screen.ERROR, ReviewPresentation.screen(isLoading = false, hasError = true, queueSize = 0, isDone = false))
        assertEquals(ReviewPresentation.Screen.EMPTY, ReviewPresentation.screen(isLoading = false, hasError = false, queueSize = 0, isDone = false))
        assertEquals(ReviewPresentation.Screen.CLEARED, ReviewPresentation.screen(isLoading = false, hasError = false, queueSize = 2, isDone = true))
        assertEquals(ReviewPresentation.Screen.QUESTION, ReviewPresentation.screen(isLoading = false, hasError = false, queueSize = 2, isDone = false))
    }

    @Test
    fun `the due label counts from one`() {
        assertEquals("1/2 due", ReviewPresentation.dueLabel(0, 2))
        assertEquals("2/2 due", ReviewPresentation.dueLabel(1, 2))
    }

    @Test
    fun `the bar counts the checked item and never divides by zero`() {
        assertEquals(0f, ReviewPresentation.progress(0, 4, false), 0.0001f)
        assertEquals(0.25f, ReviewPresentation.progress(0, 4, true), 0.0001f)
        assertEquals(0.5f, ReviewPresentation.progress(2, 4, false), 0.0001f)
        assertEquals(1f, ReviewPresentation.progress(3, 4, true), 0.0001f)
        assertEquals(1f, ReviewPresentation.progress(0, 0, true), 0.0001f)
    }

    @Test
    fun `the verdict uses the review wording not the lessons`() {
        assertEquals("Still got it.", ReviewPresentation.verdictTitle(true))
        assertEquals("Back in the queue.", ReviewPresentation.verdictTitle(false))
    }
}

class FriendsPresentationTest {
    @Test
    fun `the count line is plural only for more than one and absent with none`() {
        assertEquals("1 friend", FriendsPresentation.countLine(1))
        assertEquals("3 friends", FriendsPresentation.countLine(3))
        assertNull(FriendsPresentation.countLine(0))
        assertNull(FriendsPresentation.countLine(-2))
    }

    @Test
    fun `the list header is the count or Your friends`() {
        assertEquals("2 friends", FriendsPresentation.friendsHeader(2))
        assertEquals("Your friends", FriendsPresentation.friendsHeader(0))
    }
}

class OutOfHeartsHeartsTest {
    @Test
    fun `the sheet shows the hearts it is given and defaults to the gate's zero`() {
        assertEquals(0, OutOfHeartsModel(refillAt = null).hearts)
        assertEquals(3, OutOfHeartsModel(refillAt = null, hearts = 3).hearts)
    }

    @Test
    fun `the message carries the countdown the sheet highlights`() {
        val m = OutOfHeartsModel(refillAt = 272_000)
        assertEquals("4:32", m.countdown(0))
        assertTrue(m.message(0).contains("Your next heart comes back in 4:32."))
    }
}
