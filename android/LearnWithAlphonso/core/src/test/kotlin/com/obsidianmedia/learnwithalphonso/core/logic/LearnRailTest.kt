package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.net.WeeklyChallenge
import org.junit.jupiter.api.Assertions.assertEquals
import com.obsidianmedia.learnwithalphonso.core.team.TeamMission
import com.obsidianmedia.learnwithalphonso.core.team.TeamMissionStatus
import org.junit.jupiter.api.Test

class LearnRailTest {
    private fun challenge(done: Boolean) = WeeklyChallenge("t", "T", "", if (done) 5 else 1, 5, done)

    @Test
    fun `review card says how many are due, or that nothing is`() {
        assertEquals("All caught up", LearnRail.reviewValue(0))
        assertEquals("3 due", LearnRail.reviewValue(3))
    }

    @Test
    fun `review card keeps the old row's spoken wording`() {
        assertEquals("Review, Nothing due right now", LearnRail.reviewSpoken(0))
        assertEquals("Review, 1 item ready to review", LearnRail.reviewSpoken(1))
        assertEquals("Review, 4 items ready to review", LearnRail.reviewSpoken(4))
    }

    @Test
    fun `weekly card counts the completed challenges`() {
        assertEquals("1 of 3 done", LearnRail.weeklyValue(listOf(challenge(true), challenge(false), challenge(false))))
    }

    private fun mission(status: TeamMissionStatus, percent: Int) =
        TeamMission("t", "2026-11-16", "2026-11-22", 8, 3, 1, 3, status, 50, false, 4, percent, "h", "f")

    @Test
    fun `team card shows progress, an invitation or completion by status`() {
        assertEquals("38% done", LearnRail.teamValue(mission(TeamMissionStatus.IN_PROGRESS, 38)))
        assertEquals("Invite a friend", LearnRail.teamValue(mission(TeamMissionStatus.NEEDS_MEMBERS, 0)))
        assertEquals("Complete", LearnRail.teamValue(mission(TeamMissionStatus.COMPLETE, 100)))
    }
}
