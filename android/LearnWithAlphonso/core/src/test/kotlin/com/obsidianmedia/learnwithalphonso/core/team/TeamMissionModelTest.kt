package com.obsidianmedia.learnwithalphonso.core.team

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.io.IOException

/**
 * The refresh logic behind the team mission card. The same two properties as the learning goal card: a slow answer
 * that arrives after a newer request finished must be dropped (the team screen refreshes after a kick), and a failure
 * shows nothing rather than a fabricated empty mission.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class TeamMissionModelTest {
    private fun mission(headline: String) = TeamMission(
        teamId = "t1", weekStart = "2026-10-05", weekEnd = "2026-10-12", target = 8, total = 3, myCount = 2, memberCount = 2,
        status = TeamMissionStatus.IN_PROGRESS, rewardXp = 50, rewarded = false, daysLeft = 5, percent = 37,
        headline = headline, footer = "",
    )

    @Test
    fun `starts empty and shows the fetched mission`() = runTest {
        val model = TeamMissionModel { mission("3 of 8 lessons done") }
        assertNull(model.state.value)
        model.refresh()
        assertEquals("3 of 8 lessons done", model.state.value?.headline)
    }

    @Test
    fun `no team clears the card`() = runTest {
        var answer: TeamMission? = mission("a")
        val model = TeamMissionModel { answer }
        model.refresh()
        answer = null
        model.refresh()
        assertNull(model.state.value)
    }

    @Test
    fun `a failed refresh shows nothing, never a stale or invented mission`() = runTest {
        var fail = false
        val model = TeamMissionModel { if (fail) throw IOException("offline") else mission("a") }
        model.refresh()
        fail = true
        model.refresh()
        assertNull(model.state.value)
    }

    @Test
    fun `a slow older answer cannot overwrite a newer one`() = runTest {
        val slow = CompletableDeferred<TeamMission?>()
        var calls = 0
        val model = TeamMissionModel { if (++calls == 1) slow.await() else mission("fresh") }
        val first = async { model.refresh() }
        advanceUntilIdle()
        model.refresh()
        assertEquals("fresh", model.state.value?.headline)
        slow.complete(mission("stale"))
        first.await()
        assertEquals("fresh", model.state.value?.headline)
    }

    @Test
    fun `cancelling a refresh leaves the card as it was`() = runTest {
        val never = CompletableDeferred<TeamMission?>()
        var first = true
        val model = TeamMissionModel { if (first) { first = false; mission("kept") } else never.await() }
        model.refresh()
        val running = async { model.refresh() }
        advanceUntilIdle()
        running.cancelAndJoin()
        assertEquals("kept", model.state.value?.headline)
    }
}
