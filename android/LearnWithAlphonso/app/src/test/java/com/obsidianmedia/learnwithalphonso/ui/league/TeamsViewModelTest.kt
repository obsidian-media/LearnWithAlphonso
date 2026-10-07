package com.obsidianmedia.learnwithalphonso.ui.league

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class TeamsViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private val now = 1_790_726_400_000L
    private val teamJson = """[{"team_id":"t1","name":"Owls","join_code":"ABC123","joined_at":"2026-09-20T10:00:00.123456+00:00","switch_locked_until":"%s","this_week_xp":300,"is_owner":true}]"""

    private fun server(hasTeam: Boolean, lockedUntil: String = "2026-10-06T01:23:45.678901+00:00", joinOk: Boolean = true) = FakeServer { req ->
        when {
            req.path.endsWith("get_my_team") -> json(if (hasTeam) teamJson.format(lockedUntil) else "[]")
            req.path.endsWith("get_team_members") -> json("""[{"user_id":"u2","display_name":"Bo","avatar_seed":"cd","joined_at":"2026-09-21T00:00:00+00:00","is_owner":false}]""")
            req.path.endsWith("get_team_leaderboard") -> json("""[{"team_id":"t1","name":"Owls","weekly_xp":900}]""")
            req.path.endsWith("join_team") -> json(if (joinOk) """[{"ok":true,"team_id":"t1"}]""" else """[{"ok":false,"reason":"team is full"}]""")
            req.path.endsWith("create_team") -> json("""[{"ok":true,"team_id":"t3","join_code":"XYZ"}]""")
            else -> json("[]")
        }
    }

    @Test
    fun `with a team members load and leaving is blocked while locked`() = runBlocking {
        val s = server(hasTeam = true)
        val v = TeamsViewModel(s.progressClient) { now }
        awaitTrue("loaded") { !v.state.value.isLoading }
        assertEquals("Owls", v.state.value.myTeam!!.name)
        assertEquals(listOf("Bo"), v.state.value.members.map { it.displayName })
        assertFalse("locked until October", v.state.value.canLeave)
        assertTrue(s.paths().any { it.endsWith("get_team_members") })
    }

    @Test
    fun `an expired lock allows leaving`() = runBlocking {
        val v = TeamsViewModel(server(hasTeam = true, lockedUntil = "2026-09-01T00:00:00+00:00").progressClient) { now }
        awaitTrue("loaded") { !v.state.value.isLoading }
        assertTrue(v.state.value.canLeave)
    }

    @Test
    fun `without a team members are not requested and a rejected join surfaces the reason`() = runBlocking {
        val s = server(hasTeam = false, joinOk = false)
        val v = TeamsViewModel(s.progressClient) { now }
        awaitTrue("loaded") { !v.state.value.isLoading }
        assertNull(v.state.value.myTeam)
        assertFalse(s.paths().any { it.endsWith("get_team_members") })
        assertEquals(1, v.state.value.leaderboard.size)
        v.joinByCode(" abc ")
        awaitTrue("error") { v.state.value.error != null }
        assertEquals("team is full", v.state.value.error)
        assertEquals("""{"_code":"abc"}""", s.seen.first { it.path.endsWith("join_team") }.body)
    }

    @Test
    fun `create posts name and visibility then reloads`() = runBlocking {
        val s = server(hasTeam = false)
        val v = TeamsViewModel(s.progressClient) { now }
        awaitTrue("loaded") { !v.state.value.isLoading }
        v.createTeam(" Night Owls ", "private")
        awaitTrue("reloaded") { s.seen.count { it.path.endsWith("get_my_team") } >= 2 }
        assertEquals("""{"_name":"Night Owls","_visibility":"private"}""", s.seen.first { it.path.endsWith("create_team") }.body)
        assertNull(v.state.value.error)
    }

    @Test
    fun `a failed team lookup is a load failure, not no team, and a retry recovers`() = runBlocking {
        var failing = true
        val s = FakeServer { req ->
            when {
                req.path.endsWith("get_my_team") ->
                    if (failing) json("""{"message":"boom"}""", HttpStatusCode.InternalServerError) else json(teamJson.format("2026-10-06T01:23:45.678901+00:00"))
                else -> json("[]")
            }
        }
        val v = TeamsViewModel(s.progressClient) { now }
        awaitTrue("loaded") { !v.state.value.isLoading }
        assertNull(v.state.value.myTeam)
        assertTrue("the screen must not offer create/join during an outage", v.state.value.teamLoadFailed)

        failing = false
        v.loadAll()
        awaitTrue("recovered") { v.state.value.myTeam != null }
        assertFalse(v.state.value.teamLoadFailed)
    }

    @Test
    fun `a failed refresh keeps the team already on screen`() = runBlocking {
        var failing = false
        val s = FakeServer { req ->
            when {
                req.path.endsWith("get_my_team") ->
                    if (failing) json("{}", HttpStatusCode.InternalServerError) else json(teamJson.format("2026-10-06T01:23:45.678901+00:00"))
                else -> json("[]")
            }
        }
        val v = TeamsViewModel(s.progressClient) { now }
        awaitTrue("loaded") { v.state.value.myTeam != null }
        failing = true
        v.loadAll()
        awaitTrue("refreshed") { !v.state.value.isLoading }
        assertEquals("Owls", v.state.value.myTeam!!.name)
        assertFalse(v.state.value.teamLoadFailed)
    }

    @Test
    fun `leaving clears the team even if the reload then fails`() = runBlocking {
        var failing = false
        val s = FakeServer { req ->
            when {
                req.path.endsWith("get_my_team") ->
                    if (failing) json("{}", HttpStatusCode.InternalServerError) else json(teamJson.format("2026-09-01T00:00:00+00:00"))
                req.path.endsWith("leave_team") -> { failing = true; json("""[{"ok":true}]""") }
                else -> json("[]")
            }
        }
        val v = TeamsViewModel(s.progressClient) { now }
        awaitTrue("loaded") { v.state.value.myTeam != null }
        v.leave()
        awaitTrue("left") { v.state.value.myTeam == null && !v.state.value.isLoading }
        assertTrue("a failed reload after leaving shows the retry card, not the old team", v.state.value.teamLoadFailed)
    }

    @Test
    fun `no team is not a load failure`() = runBlocking {
        val v = TeamsViewModel(server(hasTeam = false).progressClient) { now }
        awaitTrue("loaded") { !v.state.value.isLoading }
        assertFalse(v.state.value.teamLoadFailed)
    }

    private fun assertFalse(msg: String, v: Boolean) = assertFalse(v)
}
