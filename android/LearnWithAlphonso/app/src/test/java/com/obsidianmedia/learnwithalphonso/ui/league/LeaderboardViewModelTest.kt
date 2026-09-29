package com.obsidianmedia.learnwithalphonso.ui.league

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.logic.LeaderboardSnapshotEntry
import com.obsidianmedia.learnwithalphonso.data.LeaderboardSnapshotCache
import com.obsidianmedia.learnwithalphonso.data.LeagueTierCache
import com.obsidianmedia.learnwithalphonso.data.MemoryPrefs
import com.obsidianmedia.learnwithalphonso.data.WeeklyRecapCache
import com.obsidianmedia.learnwithalphonso.ui.social.SocialTarget
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class LeaderboardViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private val me = "me"
    private val now = 1_790_726_400_000L // Wednesday 2026-09-30

    private fun rows(vararg ids: String) = ids.mapIndexed { i, id -> """{"user_id":"$id","display_name":"N$id","country":null,"avatar_seed":"$id","xp":${100 - i}}""" }.joinToString(",", "[", "]")

    private fun server(board: String, blockOk: Boolean = true, activity: String = """[{"xp_earned":30},{"xp_earned":12}]""") = FakeServer { req ->
        when {
            req.path.endsWith("get_leaderboard") -> json(board)
            req.path.endsWith("block_user") -> json("""[{"ok":$blockOk,"message":"x"}]""")
            req.path.endsWith("activity_days") -> json(activity)
            else -> json("[]")
        }
    }

    private fun vm(s: FakeServer, prefs: MemoryPrefs = MemoryPrefs()) =
        LeaderboardViewModel(s.progressClient, LeaderboardSnapshotCache(prefs), WeeklyRecapCache(prefs), LeagueTierCache(prefs), me) { now }

    @Test
    fun `load posts scope and period and a first launch never toasts`() = runBlocking {
        // Review Focus 3.
        val s = server(rows("bob", me))
        val v = vm(s)
        awaitTrue("loaded") { !v.state.value.isLoading }
        assertEquals(listOf("bob", me), v.state.value.rows.map { it.userId })
        awaitTrue("snapshot stored") { s.seen.count { it.path.endsWith("get_leaderboard") } >= 2 }
        assertNull(v.state.value.toast)
        v.select(scope = LeaderboardScope.FRIENDS, period = LeaderboardPeriod.ALL_TIME)
        awaitTrue("friends loaded") { s.seen.any { it.body == """{"_scope":"friends","_period":"all-time"}""" } && !v.state.value.isLoading }
    }

    @Test
    fun `an overtake since the cached snapshot toasts once and the cache is replaced`() = runBlocking {
        val prefs = MemoryPrefs()
        LeaderboardSnapshotCache(prefs).lastSnapshot = listOf(LeaderboardSnapshotEntry(me, 100), LeaderboardSnapshotEntry("bob", 90))
        val s = server(rows("bob", me))
        val v = vm(s, prefs)
        awaitTrue("toast") { v.state.value.toast == "Someone passed you on the leaderboard!" }
        assertEquals(listOf("bob", me), LeaderboardSnapshotCache(prefs).lastSnapshot!!.map { it.userId })
        v.clearToast()
        v.checkForOvertake()
        awaitTrue("second check ran") { s.seen.count { it.path.endsWith("get_leaderboard") } >= 3 }
        assertNull("no second toast for the same standings", v.state.value.toast)
    }

    @Test
    fun `block removes the row and toasts the name`() = runBlocking {
        // Review Focus 1.
        val s = server(rows("bob", me))
        val v = vm(s)
        awaitTrue("loaded") { !v.state.value.isLoading }
        v.block(SocialTarget("bob", "Nbob"))
        awaitTrue("row removed") { v.state.value.rows.none { it.userId == "bob" } }
        assertEquals("Nbob blocked.", v.state.value.toast)
        assertTrue(s.seen.any { it.path.endsWith("block_user") && it.body == """{"_target":"bob"}""" })
    }

    @Test
    fun `a failed block keeps the row and says so`() = runBlocking {
        val s = server(rows("bob", me), blockOk = false)
        val v = vm(s)
        awaitTrue("loaded") { !v.state.value.isLoading }
        v.block(SocialTarget("bob", "Nbob"))
        awaitTrue("toast") { v.state.value.toast != null }
        assertEquals("Couldn't block Nbob. Try again.", v.state.value.toast)
        assertEquals(2, v.state.value.rows.size)
    }

    @Test
    fun `recap sums last week between the two Mondays, ranks me, and celebrates a promotion once`() = runBlocking {
        val prefs = MemoryPrefs()
        LeagueTierCache(prefs).lastKnownTier = "silver"
        WeeklyRecapCache(prefs).lastRecapLeagueTier = "bronze"
        val s = server(rows("bob", me))
        val v = vm(s, prefs)
        v.loadRecap()
        awaitTrue("recap") { !v.recap.value.isLoading }
        val r = v.recap.value
        assertEquals(42, r.lastWeekXp)
        assertEquals(2, r.currentRank)
        assertEquals("silver", r.promotedToTier)
        val activity = s.seen.first { it.path.endsWith("activity_days") }
        assertEquals(listOf("gte.2026-09-21", "lt.2026-09-28"), activity.queryAll("day"))
        v.loadRecap()
        awaitTrue("second recap") { !v.recap.value.isLoading }
        assertNull(v.recap.value.promotedToTier)
    }
}
