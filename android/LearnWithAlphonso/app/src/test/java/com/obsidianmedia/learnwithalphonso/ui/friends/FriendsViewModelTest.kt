package com.obsidianmedia.learnwithalphonso.ui.friends

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.logic.GiftButtonState
import com.obsidianmedia.learnwithalphonso.core.logic.NudgeCooldown
import com.obsidianmedia.learnwithalphonso.core.net.FriendProgress
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
            req.method == "GET" && req.path.endsWith("user_progress") -> json("""[{"streak_freezes":2}]""")
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

class FriendsGiftViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private fun giftServer(
        giftRpc: String = """[{"ok":true,"reason":null,"freezes":1}]""",
        balance: Int = 2,
        sentToday: String = "[]",
        unreadGifts: String = "[]",
    ) = FakeServer { req ->
        when {
            req.path.endsWith("get_friends_progress") -> json("""[{"user_id":"u2","display_name":"Bo","avatar_seed":"cd","streak":3,"week_xp":40}]""")
            req.path.endsWith("gift_streak_freeze") -> json(giftRpc)
            req.method == "GET" && req.path.endsWith("user_progress") -> json("""[{"streak_freezes":$balance}]""")
            req.method == "GET" && req.path.endsWith("streak_freeze_gifts") -> json(if (req.query["sender_id"] != null) sentToday else unreadGifts)
            else -> json("[]")
        }
    }

    private fun vm(s: FakeServer) =
        FriendsViewModel(s.progressClient, NudgeCooldownCache(MemoryPrefs()) { 1_758_000_000_000L }, "me", "https://learn.alphonsoecosystem.app/")

    private suspend fun loaded(s: FakeServer): FriendsViewModel {
        val v = vm(s)
        awaitTrue("loaded") { !v.state.value.isLoading && v.state.value.giftState.freezes != null }
        return v
    }

    @Test
    fun `the row offers the gift only with a freeze held and no gift to that friend today`() = runBlocking {
        val bo = FriendProgress("u2", "Bo", "cd", 3, 40)
        assertEquals(GiftButtonState.SEND, loaded(giftServer(balance = 2)).giftButtonState(bo))
        assertEquals(GiftButtonState.NO_FREEZE, loaded(giftServer(balance = 0)).giftButtonState(bo))
        assertEquals(GiftButtonState.SENT_TODAY, loaded(giftServer(balance = 2, sentToday = """[{"recipient_id":"u2"}]""")).giftButtonState(bo))
    }

    @Test
    fun `the gift state reads only my own rows, today (UTC) for the gifts`() = runBlocking {
        val s = giftServer()
        loaded(s)
        val progress = s.seen.first { it.method == "GET" && it.path.endsWith("user_progress") }
        assertEquals("eq.me", progress.query["user_id"])
        val sent = s.seen.first { it.path.endsWith("streak_freeze_gifts") && it.query["sender_id"] != null }
        assertEquals("eq.me", sent.query["sender_id"])
        // The exact UTC day is pinned in SocialClientTest, where the clock is injected; here only that a day is sent.
        assertTrue(sent.query["gift_day"].orEmpty().let { it.startsWith("eq.20") && it.length == 13 })
    }

    @Test
    fun `gifting sends only the recipient and a success reads as sent, then the state is re-read`() = runBlocking {
        val s = giftServer()
        val v = loaded(s)
        v.gift(v.state.value.friends.single())
        awaitTrue("toast") { v.state.value.toast == "Freeze sent to Bo." }
        assertEquals("""{"_recipient":"u2"}""", s.seen.first { it.path.endsWith("gift_streak_freeze") }.body)
        awaitTrue("re-read") { s.seen.count { it.method == "GET" && it.path.endsWith("user_progress") } >= 2 }
        assertEquals(null, v.state.value.givingId)
    }

    @Test
    fun `each refusal from the database reads as its own message`() = runBlocking {
        val cases = mapOf(
            "recipient-full" to "Bo already has all the freezes they can hold.",
            "already-gifted-today" to "You already gifted Bo a freeze today. Try again tomorrow.",
            "no-freeze" to "You have no streak freeze to give.",
            "not-friends" to "Couldn't send a freeze to Bo.",
            "something-new" to "Couldn't send a freeze to Bo. Try again.",
        )
        for ((reason, message) in cases) {
            val v = loaded(giftServer(giftRpc = """[{"ok":false,"reason":"$reason","freezes":2}]"""))
            v.gift(v.state.value.friends.single())
            awaitTrue("toast for $reason") { v.state.value.toast == message }
        }
    }

    @Test
    fun `a failed call reads as a plain error and never a made-up reason`() = runBlocking {
        val v = loaded(giftServer(giftRpc = "not json"))
        v.gift(v.state.value.friends.single())
        awaitTrue("toast") { v.state.value.toast == "Couldn't send a freeze to Bo. Try again." }
        assertEquals(null, v.state.value.givingId)
    }

    @Test
    fun `a received gift toasts the sender by name and is marked read once, not again on resume`() = runBlocking {
        val s = giftServer(unreadGifts = """[{"id":"g1","sender_id":"u2"}]""")
        val v = vm(s)
        awaitTrue("toast") { v.state.value.toast == "Bo gifted you a streak freeze!" }
        awaitTrue("marked read") { s.seen.any { it.method == "PATCH" && it.path.endsWith("streak_freeze_gifts") && it.query["id"] == "in.(g1)" } }
        v.clearToast()
        v.checkForFreezeGifts()
        kotlinx.coroutines.delay(200)
        assertEquals(null, v.state.value.toast)
        assertEquals(1, s.seen.count { it.method == "PATCH" && it.path.endsWith("streak_freeze_gifts") })
    }

    @Test
    fun `several received gifts toast by count`() = runBlocking {
        val v = vm(giftServer(unreadGifts = """[{"id":"g1","sender_id":"u2"},{"id":"g2","sender_id":"u9"}]"""))
        awaitTrue("toast") { v.state.value.toast == "2 friends gifted you a streak freeze!" }
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
