package com.obsidianmedia.learnwithalphonso.ui.friends

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.logic.NudgeCooldown
import com.obsidianmedia.learnwithalphonso.data.MemoryPrefs
import com.obsidianmedia.learnwithalphonso.data.NudgeCooldownCache
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class FriendsViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private val me = "me"
    private var now = 1_758_000_000_000L

    private fun server(unread: String = "[]", blockOk: Boolean = true) = FakeServer { req ->
        when {
            req.path.endsWith("get_friends_progress") -> json("""[{"user_id":"u2","display_name":"Bo","avatar_seed":"cd","streak":3,"week_xp":40},{"user_id":"u3","display_name":"Cy","avatar_seed":"ef","streak":1,"week_xp":5}]""")
            req.path.endsWith("friend_activity_events") -> json("""[{"id":"e1","user_id":"u2","event_type":"lesson_completed","payload":{"xpGain":50},"created_at":"2026-09-24T01:00:00+00:00"},{"id":"e2","user_id":"u3","event_type":"streak_milestone","payload":{"streak":7},"created_at":"2026-09-24T02:00:00+00:00"},{"id":"e3","user_id":"me","event_type":"league_promotion","payload":{"newTier":"silver"},"created_at":"2026-09-24T03:00:00+00:00"}]""")
            req.path.endsWith("get_or_create_my_friend_code") -> json("""[{"code":"Zx9ab"}]""")
            req.method == "GET" && req.path.endsWith("nudges") -> json(unread)
            req.path.endsWith("block_user") -> json("""[{"ok":$blockOk,"message":"x"}]""")
            req.path.endsWith("remove_friend") -> json("""[{"ok":true,"message":"removed"}]""")
            else -> json("")
        }
    }

    private fun vm(s: FakeServer, prefs: MemoryPrefs = MemoryPrefs()) =
        FriendsViewModel(s.progressClient, NudgeCooldownCache(prefs) { now }, me, "https://learn.alphonsoecosystem.app/")

    @Test
    fun `loads friends, activity copy and the invite link from the friend code`() = runBlocking {
        val v = vm(server())
        awaitTrue("loaded") { !v.state.value.isLoading }
        assertEquals("https://learn.alphonsoecosystem.app/invite/Zx9ab", v.state.value.inviteLink)
        assertEquals(listOf("Bo", "Cy"), v.state.value.friends.map { it.displayName })
        assertEquals(
            listOf("Bo completed a lesson (+50 XP)", "Cy hit a 7-day streak", "You moved up to Silver"),
            v.state.value.activity.map { v.activityCopy(it) },
        )
    }

    @Test
    fun `nudge records the cooldown and the friend is not nudgeable until a day later`() = runBlocking {
        val s = server()
        val prefs = MemoryPrefs()
        val v = vm(s, prefs)
        awaitTrue("loaded") { !v.state.value.isLoading }
        val bo = v.state.value.friends[0]
        assertTrue(v.canNudge(bo))
        v.nudge(bo)
        awaitTrue("nudged") { v.state.value.nudgeVersion == 1 }
        assertTrue(s.seen.any { it.method == "POST" && it.path.endsWith("/nudges") && it.body == """{"recipient_id":"u2"}""" })
        assertFalse(v.canNudge(bo))
        assertTrue(v.canNudge(v.state.value.friends[1]))
        now += NudgeCooldown.COOLDOWN_MS
        assertTrue(v.canNudge(bo))
    }

    @Test
    fun `block removes the friend and their activity rows`() = runBlocking {
        // Review Focus 1.
        val v = vm(server())
        awaitTrue("loaded") { !v.state.value.isLoading }
        v.block(v.state.value.friends[0])
        awaitTrue("blocked") { v.state.value.toast == "Bo blocked." }
        assertEquals(listOf("Cy"), v.state.value.friends.map { it.displayName })
        assertEquals(listOf("e2", "e3"), v.state.value.activity.map { it.id })
    }

    @Test
    fun `remove drops the friend on ok`() = runBlocking {
        val v = vm(server())
        awaitTrue("loaded") { !v.state.value.isLoading }
        v.remove(v.state.value.friends[1])
        awaitTrue("removed") { v.state.value.friends.size == 1 }
        assertEquals("Bo", v.state.value.friends.single().displayName)
    }

    @Test
    fun `unread nudges toast in singular and plural and are marked read`() = runBlocking {
        val one = server(unread = """[{"id":"n1","sender_id":"u2","created_at":"2026-09-24T03:00:00+00:00"}]""")
        val v = vm(one)
        awaitTrue("toast") { v.state.value.toast == "Bo nudged you!" }
        awaitTrue("marked read") { one.seen.any { it.method == "PATCH" && it.query["id"] == "in.(n1)" } }
        val two = server(unread = """[{"id":"n1","sender_id":"u2","created_at":"2026-09-24T03:00:00+00:00"},{"id":"n2","sender_id":"u9","created_at":"2026-09-24T03:00:00+00:00"}]""")
        val v2 = vm(two)
        awaitTrue("plural toast") { v2.state.value.toast == "2 friends nudged you!" }
    }
}

class InviteAcceptViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private fun server(preview: String, accept: String = """[{"ok":true,"message":"friends"}]""") = FakeServer { req ->
        when {
            req.path.endsWith("get_friend_invite_preview") -> json(preview)
            req.path.endsWith("accept_friend_invite") -> json(accept)
            else -> json("[]")
        }
    }

    @Test
    fun `a self invite shows the self state and never accepts`() = runBlocking {
        // Review Focus 5.
        val s = server("""[{"ok":true,"is_self":true,"display_name":"Me","avatar_seed":"aa"}]""")
        val v = InviteAcceptViewModel(s.progressClient, "code1")
        awaitTrue("previewed") { v.state.value != InviteState.Loading }
        assertEquals(InviteState.Self, v.state.value)
        v.accept()
        assertFalse(s.seen.any { it.path.endsWith("accept_friend_invite") })
    }

    @Test
    fun `an invalid code shows the invalid state`() = runBlocking {
        val v = InviteAcceptViewModel(server("""[{"ok":false,"is_self":false,"display_name":null,"avatar_seed":null}]""").progressClient, "nope")
        awaitTrue("previewed") { v.state.value != InviteState.Loading }
        assertEquals(InviteState.Invalid, v.state.value)
    }

    @Test
    fun `a valid code previews the inviter and accept posts the code`() = runBlocking {
        val s = server("""[{"ok":true,"is_self":false,"display_name":"Ana","avatar_seed":"ab"}]""")
        val v = InviteAcceptViewModel(s.progressClient, "Zx9ab")
        awaitTrue("ready") { v.state.value is InviteState.Ready }
        assertEquals(InviteState.Ready("Ana"), v.state.value)
        v.accept()
        awaitTrue("accepted") { v.state.value is InviteState.Accepted }
        assertEquals("""{"_code":"Zx9ab"}""", s.seen.first { it.path.endsWith("accept_friend_invite") }.body)
    }
}
