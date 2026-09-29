package com.obsidianmedia.learnwithalphonso.ui.friends

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class DuelsViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private val me = "me"

    private fun duel(id: String, status: String, challenger: String, opponent: String, winner: String? = null) =
        """{"duel_id":"$id","challenger_id":"$challenger","opponent_id":"$opponent","course":"en","status":"$status","challenger_xp_start":10,"opponent_xp_start":20,"challenger_xp_now":40,"opponent_xp_now":25,"winner_id":${winner?.let { "\"$it\"" } ?: "null"},"ends_at":null}"""

    private fun server(respondOk: Boolean = true, matched: Boolean = false) = FakeServer { req ->
        when {
            req.path.endsWith("get_my_duels") -> json("[${duel("p1", "pending", "u2", me)},${duel("p2", "pending", me, "u3")},${duel("a1", "active", me, "u2")},${duel("c1", "completed", "u2", me, winner = me)},${duel("c2", "completed", me, "u2", winner = "u2")},${duel("c3", "completed", me, "u2")},${duel("d1", "declined", me, "u2")}]")
            req.path.endsWith("get_friends_progress") -> json("""[{"user_id":"u2","display_name":"Bo","avatar_seed":"cd","streak":1,"week_xp":5}]""")
            req.path.endsWith("respond_to_duel") -> json(if (respondOk) """[{"ok":true}]""" else """[{"ok":false,"reason":"expired"}]""")
            req.path.endsWith("join_open_duel_queue") -> json("""[{"matched":$matched}]""")
            else -> json("[]")
        }
    }

    @Test
    fun `partitions duels by status and my side, and labels results`() = runBlocking {
        val v = DuelsViewModel(server().progressClient, me)
        awaitTrue("loaded") { !v.state.value.isLoading }
        assertEquals(listOf("p1"), v.pending.map { it.duelId })
        assertEquals(listOf("a1"), v.active.map { it.duelId })
        assertEquals(listOf("c1", "c2", "c3", "d1"), v.finished.map { it.duelId })
        val active = v.active.single()
        assertEquals(30, v.myDelta(active))
        assertEquals(5, v.theirDelta(active))
        assertEquals("u2", v.opponentId(active))
        assertEquals(listOf("You won", "You lost", "Tied", "Declined"), v.finished.map { v.resultLabel(it) })
    }

    @Test
    fun `respond reloads on ok and shows the reason otherwise`() = runBlocking {
        val ok = server()
        val v = DuelsViewModel(ok.progressClient, me)
        awaitTrue("loaded") { !v.state.value.isLoading }
        v.respond(v.pending.single(), true)
        awaitTrue("reloaded") { ok.seen.count { it.path.endsWith("get_my_duels") } >= 2 }
        assertEquals("""{"_duel_id":"p1","_accept":true}""", ok.seen.first { it.path.endsWith("respond_to_duel") }.body)
        val bad = server(respondOk = false)
        val v2 = DuelsViewModel(bad.progressClient, me)
        awaitTrue("loaded") { !v2.state.value.isLoading }
        v2.respond(v2.pending.single(), false)
        awaitTrue("error") { v2.state.value.error == "expired" }
    }

    @Test
    fun `queue join that matches reloads, one that does not sets waiting, leaving clears it`() = runBlocking {
        val matched = server(matched = true)
        val v = DuelsViewModel(matched.progressClient, me)
        awaitTrue("loaded") { !v.state.value.isLoading }
        v.joinQueue("fr", true)
        awaitTrue("reloaded") { matched.seen.count { it.path.endsWith("get_my_duels") } >= 2 && !v.state.value.queueing }
        assertFalse(v.state.value.waitingInQueue)
        assertEquals("""{"_course":"fr","_match_by_level":true}""", matched.seen.first { it.path.endsWith("join_open_duel_queue") }.body)
        val waiting = server(matched = false)
        val v2 = DuelsViewModel(waiting.progressClient, me)
        awaitTrue("loaded") { !v2.state.value.isLoading }
        v2.joinQueue("en", false)
        awaitTrue("waiting") { v2.state.value.waitingInQueue }
        v2.leaveQueue()
        awaitTrue("left") { !v2.state.value.waitingInQueue && waiting.seen.any { it.path.endsWith("leave_duel_queue") } }
        assertTrue(true)
    }
}
