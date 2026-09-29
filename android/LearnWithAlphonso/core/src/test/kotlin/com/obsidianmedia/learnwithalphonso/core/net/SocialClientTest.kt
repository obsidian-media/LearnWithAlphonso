package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Mirrors the social parts of ProgressSyncClientTests.swift and the +Teams/+Season/+Challenges/+SocialSafety tests. */
class SocialClientTest {
    private val now = 1_758_000_000_000L
    private fun client(fake: FakeSupabase) = ProgressSyncClient(fake.http) { now }

    @Test
    fun `leaderboard posts scope and period and decodes rows`() = runTest {
        val fake = FakeSupabase { json("""[{"user_id":"u1","display_name":"Ana","country":"fr","avatar_seed":"ab","xp":120},{"user_id":"u2","display_name":"Bo","country":null,"avatar_seed":"cd","xp":80}]""") }
        val rows = client(fake).fetchLeaderboard("friends", "weekly")
        assertEquals(listOf(LeaderboardRow("u1", "Ana", "fr", "ab", 120), LeaderboardRow("u2", "Bo", null, "cd", 80)), rows)
        assertEquals("/rest/v1/rpc/get_leaderboard", fake.seen.single().path)
        assertEquals("""{"_scope":"friends","_period":"weekly"}""", fake.seen.single().body)
    }

    @Test
    fun `activity xp sends both day bounds and sums`() = runTest {
        val fake = FakeSupabase { json("""[{"xp_earned":10},{"xp_earned":25}]""") }
        assertEquals(35, client(fake).fetchActivityXp("u1", "2026-09-21", "2026-09-28"))
        val req = fake.seen.single()
        assertEquals("/rest/v1/activity_days", req.path)
        assertEquals("eq.u1", req.query["user_id"])
        assertEquals(listOf("gte.2026-09-21", "lt.2026-09-28"), req.queryAll("day"))
    }

    @Test
    fun `friend code, invite accept and preview follow the opaque-code contract`() = runTest {
        val fake = FakeSupabase { req ->
            when {
                req.path.endsWith("get_or_create_my_friend_code") -> json("""[{"code":"Zx9_ab"}]""")
                req.path.endsWith("accept_friend_invite") -> json("""[{"ok":false,"message":"invalid-code"}]""")
                else -> json("""[{"ok":true,"is_self":true,"display_name":"Me","avatar_seed":"aa"}]""")
            }
        }
        val c = client(fake)
        assertEquals("Zx9_ab", c.getMyFriendCode())
        assertEquals(false to "invalid-code", c.acceptFriendInvite("bad"))
        assertEquals("""{"_code":"bad"}""", fake.seen[1].body)
        assertEquals(FriendInvitePreview(true, true, "Me", "aa"), c.getFriendInvitePreview("Zx9_ab"))
        assertEquals("/rest/v1/rpc/get_friend_invite_preview", fake.seen[2].path)
    }

    @Test
    fun `friends progress, activity feed and nudges`() = runTest {
        val fake = FakeSupabase { req ->
            when {
                req.path.endsWith("get_friends_progress") -> json("""[{"user_id":"u2","display_name":"Bo","avatar_seed":"cd","streak":3,"week_xp":40}]""")
                req.path.endsWith("friend_activity_events") -> json("""[{"id":"e1","user_id":"u2","event_type":"lesson_completed","payload":{"lessonId":"u1l1","xpGain":50},"created_at":"2026-09-24T01:23:45.678901+00:00"},{"id":"e2","user_id":"u2","event_type":"league_promotion","payload":{"newTier":"silver"},"created_at":"2026-09-24T02:00:00+00:00"}]""")
                req.method == "GET" && req.path.endsWith("nudges") -> json("""[{"id":"n1","sender_id":"u2","created_at":"2026-09-24T03:00:00+00:00"}]""")
                else -> json("")
            }
        }
        val c = client(fake)
        assertEquals(listOf(FriendProgress("u2", "Bo", "cd", 3, 40)), c.fetchFriendsProgress())
        val events = c.fetchFriendActivity()
        assertEquals("u1l1", events[0].lessonId)
        assertEquals(50, events[0].xpGain)
        assertEquals("silver", events[1].newTier)
        assertNull(events[1].xpGain)
        assertEquals(listOf("id,user_id,event_type,payload,created_at"), listOf(fake.seen[1].query["select"]))
        c.sendNudge("u2")
        assertEquals("""{"recipient_id":"u2"}""", fake.seen[2].body)
        assertEquals("return=minimal", fake.seen[2].headers["Prefer"])
        val unread = c.fetchUnreadNudges()
        assertEquals("u2", unread.single().senderId)
        assertEquals("is.null", fake.seen[3].query["read_at"])
        c.markNudgesRead(emptyList())
        assertEquals(4, fake.seen.size)
        c.markNudgesRead(listOf("n1", "n2"))
        assertEquals("PATCH", fake.seen[4].method)
        assertEquals("in.(n1,n2)", fake.seen[4].query["id"])
        assertTrue(fake.seen[4].body.startsWith("""{"read_at":"2025-09-16T05:20:00"""))
    }

    @Test
    fun `streak freeze purchase maps ok and insufficient xp`() = runTest {
        val ok = FakeSupabase { json("""[{"ok":true,"streak_freezes":2,"xp":150}]""") }
        assertEquals(BuyStreakFreezeResult.Ok(2, 150), client(ok).buyStreakFreezeWithXp("en"))
        assertEquals("""{"_course":"en"}""", ok.seen.single().body)
        val no = FakeSupabase { json("""[{"ok":false,"streak_freezes":1}]""") }
        assertEquals(BuyStreakFreezeResult.InsufficientXp(1), client(no).buyStreakFreezeWithXp("en"))
    }

    @Test
    fun `duels create respond list and queue`() = runTest {
        val fake = FakeSupabase { req ->
            when {
                req.path.endsWith("create_duel") -> json("""[{"ok":true,"duel_id":"d1"}]""")
                req.path.endsWith("respond_to_duel") -> json("""[{"ok":false,"reason":"already resolved"}]""")
                req.path.endsWith("get_my_duels") -> json("""[{"duel_id":"d1","challenger_id":"u1","opponent_id":"u2","course":"en","status":"active","challenger_xp_start":10,"opponent_xp_start":20,"challenger_xp_now":40,"opponent_xp_now":25,"winner_id":null,"ends_at":"2026-10-01T00:00:00+00:00"}]""")
                req.path.endsWith("join_open_duel_queue") -> json("""[{"matched":false}]""")
                else -> json("")
            }
        }
        val c = client(fake)
        assertEquals(DuelCreateOutcome(true, null, "d1"), c.createDuel("u2", "en"))
        assertEquals("""{"_opponent_id":"u2","_course":"en"}""", fake.seen[0].body)
        assertEquals(RpcOutcome(false, "already resolved"), c.respondToDuel("d1", true))
        assertEquals("""{"_duel_id":"d1","_accept":true}""", fake.seen[1].body)
        val duel = c.fetchMyDuels().single()
        assertEquals(40, duel.challengerXpNow)
        assertNull(duel.winnerId)
        assertEquals(false to null, c.joinOpenDuelQueue("fr", true))
        assertEquals("""{"_course":"fr","_match_by_level":true}""", fake.seen[3].body)
        c.leaveOpenDuelQueue()
        assertEquals("/rest/v1/rpc/leave_duel_queue", fake.seen[4].path)
    }

    @Test
    fun `weekly challenges and quest claim`() = runTest {
        val fake = FakeSupabase { req ->
            if (req.path.endsWith("get_weekly_challenges")) json("""[{"template_id":"t1","title":"Finish 5 lessons","description":"d","progress":2,"threshold":5,"completed":false}]""")
            else json("""[{"ok":true,"xp":100}]""")
        }
        val c = client(fake)
        assertEquals(listOf(WeeklyChallenge("t1", "Finish 5 lessons", "d", 2, 5, false)), c.getWeeklyChallenges())
        assertEquals(QuestClaimOutcome(true, null, 100), c.claimWeeklyQuest("t1", "en", "2026-09-28"))
        assertEquals("""{"_quest_id":"t1","_course":"en","_week_start":"2026-09-28"}""", fake.seen[1].body)
    }

    @Test
    fun `my team parses fractional-second timestamps and is null without a team`() = runTest {
        // Review Focus 4: PostgREST sends fractional seconds; a parse failure here made teams invisible on iOS once.
        val fake = FakeSupabase { json("""[{"team_id":"t1","name":"Owls","join_code":"ABC123","joined_at":"2026-09-20T10:00:00.123456+00:00","switch_locked_until":"2026-10-06T01:23:45.678901+00:00","this_week_xp":300,"is_owner":true}]""") }
        val team = client(fake).getMyTeam()!!
        assertEquals("Owls", team.name)
        assertTrue(team.isOwner)
        assertEquals(1791249825678L, team.switchLockedUntilMillis)
        assertNull(client(FakeSupabase { json("[]") }).getMyTeam())
    }

    @Test
    fun `team members leaderboard join create kick leave`() = runTest {
        val fake = FakeSupabase { req ->
            when {
                req.path.endsWith("get_team_members") -> json("""[{"user_id":"u2","display_name":"Bo","avatar_seed":"cd","joined_at":"2026-09-21T00:00:00+00:00","is_owner":false}]""")
                req.path.endsWith("get_team_leaderboard") -> json("""[{"team_id":"t1","name":"Owls","weekly_xp":900}]""")
                req.path.endsWith("auto_join_team") -> json("""[{"ok":true,"team_id":"t2"}]""")
                req.path.endsWith("join_team") -> json("""[{"ok":false,"reason":"team is full"}]""")
                req.path.endsWith("create_team") -> json("""[{"ok":true,"team_id":"t3","join_code":"XYZ789"}]""")
                req.path.endsWith("kick_team_member") -> json("""[{"ok":true}]""")
                req.path.endsWith("leave_team") -> json("""[{"ok":false,"reason":"locked"}]""")
                else -> json("[]")
            }
        }
        val c = client(fake)
        assertEquals("Bo", c.getTeamMembers().single().displayName)
        assertEquals(listOf(TeamLeaderboardRow("t1", "Owls", 900)), c.getTeamLeaderboard())
        assertEquals(TeamJoinOutcome(false, "team is full", null), c.joinTeamByCode("ABC123"))
        assertEquals("""{"_code":"ABC123"}""", fake.seen[2].body)
        assertEquals(TeamJoinOutcome(true, null, "t2"), c.autoJoinTeam())
        assertEquals(TeamCreateOutcome(true, null, "t3", "XYZ789"), c.createTeam("New", "private"))
        assertEquals("""{"_name":"New","_visibility":"private"}""", fake.seen[4].body)
        assertEquals(RpcOutcome(true, null), c.kickTeamMember("u2"))
        assertEquals("""{"_user_id":"u2"}""", fake.seen[5].body)
        assertEquals(RpcOutcome(false, "locked"), c.leaveTeam())
    }

    @Test
    fun `season status uses GET on the edge function and tolerates a missing last week`() = runTest {
        val fake = FakeSupabase { json("""{"division":3,"rankInCohort":7,"cohortSize":30}""") }
        assertEquals(SeasonStatus(3, 7, 30, null), client(fake).getSeasonStatus())
        assertEquals("GET", fake.seen.single().method)
        assertEquals("/functions/v1/get-season-status", fake.seen.single().path)
        val withLast = FakeSupabase { json("""{"division":2,"rankInCohort":1,"cohortSize":25,"lastWeekResult":{"division":3,"rankInCohort":4,"cohortSize":30}}""") }
        assertEquals(SeasonLastWeekResult(3, 4, 30), client(withLast).getSeasonStatus()!!.lastWeekResult)
    }

    @Test
    fun `identity read and writes`() = runTest {
        val fake = FakeSupabase { req -> if (req.method == "GET") json("""[{"display_name":"Ana","avatar_seed":"ab12cd34"}]""") else json("") }
        val c = client(fake)
        assertEquals(ProfileIdentity("Ana", "ab12cd34"), c.fetchProfileIdentity("u1"))
        c.updateProfileDisplayName("Ana B", "u1")
        c.updateProfileAvatarSeed("deadbeef", "u1")
        assertEquals("""{"display_name":"Ana B"}""", fake.seen[1].body)
        assertEquals("""{"avatar_seed":"deadbeef"}""", fake.seen[2].body)
        assertEquals("eq.u1", fake.seen[2].query["id"])
    }

    @Test
    fun `block unblock report`() = runTest {
        val fake = FakeSupabase { req -> if (req.path.endsWith("block_user")) json("""[{"ok":true,"message":"blocked"}]""") else json("") }
        val c = client(fake)
        assertEquals(true to "blocked", c.blockUser("u2"))
        assertEquals("""{"_target":"u2"}""", fake.seen[0].body)
        c.unblockUser("u2")
        assertEquals("DELETE", fake.seen[1].method)
        assertEquals("eq.u2", fake.seen[1].query["blocked"])
        c.reportUser("u2", "harassment")
        assertEquals("/rest/v1/content_reports", fake.seen[2].path)
        assertEquals("""{"reported":"u2","reason":"harassment"}""", fake.seen[2].body)
    }

    @Test
    fun `weakness trend aggregates per category, open first then most recent`() = runTest {
        val fake = FakeSupabase {
            json(
                """[{"category":"articles","event_type":"detected","created_at":"2026-09-01T00:00:00+00:00"},
                    {"category":"articles","event_type":"detected","created_at":"2026-09-02T00:00:00+00:00"},
                    {"category":"tenses","event_type":"detected","created_at":"2026-09-03T00:00:00+00:00"},
                    {"category":"articles","event_type":"resolved","created_at":"2026-09-04T00:00:00+00:00"},
                    {"category":"plurals","event_type":"detected","created_at":"2026-09-05T00:00:00+00:00"},
                    {"category":"plurals","event_type":"resolved","created_at":"2026-09-06T00:00:00+00:00"}]""",
            )
        }
        val trend = client(fake).fetchWeaknessTrend()
        assertEquals(listOf("articles", "tenses", "plurals"), trend.map { it.category })
        assertEquals(WeaknessTrendEntry("articles", 2, 1, 1, "2026-09-04T00:00:00+00:00"), trend[0])
        assertEquals(0, trend[2].openCount)
    }

    @Test
    fun `a server error on a social rpc surfaces as ProgressSyncError`() = runTest {
        val fake = FakeSupabase { json("""{"message":"permission denied"}""", HttpStatusCode.Forbidden) }
        val error = runCatching { client(fake).fetchFriendsProgress() }.exceptionOrNull()
        assertTrue(error is ProgressSyncError.Server)
    }
}
