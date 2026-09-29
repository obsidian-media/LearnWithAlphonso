package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Mirrors ProgressSyncClientTests.swift for the Plan 1 subset. */
class ProgressSyncClientTest {
    private val userId = "11111111-1111-1111-1111-111111111111"
    private val now = 1_758_000_000_000L // 2025-09-16T05:20:00Z

    private fun client(fake: FakeSupabase) = ProgressSyncClient(fake.http) { now }

    private val progressJson = """{"xp":100,"streak":1,"longestStreak":1,"lastActiveDate":"2026-09-18","hearts":4,"heartsRefillAt":null,"streakFreezes":0,"leagueTier":"bronze"}"""

    @Test
    fun `loseHeart posts to the rpc with auth headers and returns the resolved hearts`() = runTest {
        val fake = FakeSupabase { json("""[{"hearts":2}]""") }
        val result = client(fake).loseHeart()
        assertEquals(HeartsResult(2), result)
        val req = fake.seen.single()
        assertEquals("POST", req.method)
        assertEquals("/rest/v1/rpc/lose_heart", req.path)
        assertEquals("publishable-key", req.headers["apikey"])
        assertEquals("Bearer user-access-token", req.headers["Authorization"])
        assertEquals("{}", req.body)
    }

    @Test
    fun `setCefrLevel and savePlacementResult post the underscore params`() = runTest {
        val fake = FakeSupabase { json("") }
        client(fake).setCefrLevel("fr", "B1")
        client(fake).savePlacementResult("en", "A2", 67)
        assertEquals("/rest/v1/rpc/set_cefr_level", fake.seen[0].path)
        assertEquals("""{"_language":"fr","_level":"B1"}""", fake.seen[0].body)
        assertEquals("/rest/v1/rpc/save_placement_result", fake.seen[1].path)
        assertEquals("""{"_language":"en","_level":"A2","_score":67}""", fake.seen[1].body)
    }

    @Test
    fun `startLessonSession posts to the edge function and returns the token`() = runTest {
        val fake = FakeSupabase { json("""{"token":"tok-123"}""") }
        assertEquals("tok-123", client(fake).startLessonSession("u1l1", "en"))
        assertEquals("/functions/v1/start-lesson-session", fake.seen.single().path)
        assertEquals("""{"lessonId":"u1l1","course":"en"}""", fake.seen.single().body)
    }

    @Test
    fun `completeLesson sends one answer object per question and decodes a null heartsBonus`() = runTest {
        val fake = FakeSupabase { json("""{"xpGain":50,"newlyUnlocked":["first_lesson"],"heartsBonus":null,"progress":$progressJson}""") }
        val result = client(fake).completeLesson(
            "u1l1", 2, listOf(LessonAnswer("q1", "Good morning."), LessonAnswer("q2", "meet")), "en", "tok",
        )
        assertEquals(50, result.xpGain)
        assertEquals(listOf("first_lesson"), result.newlyUnlocked)
        assertNull(result.heartsBonus)
        assertEquals(4, result.progress.hearts)
        val body = Json.parseToJsonElement(fake.seen.single().body).jsonObject
        assertEquals("/functions/v1/complete-lesson", fake.seen.single().path)
        assertEquals(2, body["total"]!!.jsonPrimitive.content.toInt())
        assertEquals("tok", body["sessionToken"]!!.jsonPrimitive.content)
        val answers = body["answers"]!!.jsonArray
        assertEquals(listOf("q1", "q2"), answers.map { it.jsonObject["questionId"]!!.jsonPrimitive.content })
        assertEquals("meet", answers[1].jsonObject["answer"]!!.jsonPrimitive.content)
    }

    @Test
    fun `a failing edge function surfaces its error shape as a Server error`() = runTest {
        val fake = FakeSupabase { json("""{"error":"session expired"}""", HttpStatusCode.Unauthorized) }
        val error = runCatching { client(fake).startLessonSession("u1l1", "en") }.exceptionOrNull() as ProgressSyncError.Server
        assertEquals(401, error.status)
        assertEquals("session expired", error.serverMessage)
    }

    @Test
    fun `a PostgREST rejection surfaces its message`() = runTest {
        val fake = FakeSupabase { json("""{"code":"42501","message":"permission denied for table x","hint":null}""", HttpStatusCode.Forbidden) }
        val error = runCatching { client(fake).loseHeart() }.exceptionOrNull() as ProgressSyncError.Server
        assertEquals(403, error.status)
        assertEquals("permission denied for table x", error.serverMessage)
    }

    @Test
    fun `fetchDueReviews reads due rows for today in UTC then the exact count`() = runTest {
        val fake = FakeSupabase { req ->
            if (req.method == "HEAD") respond("", HttpStatusCode.OK, headersOf("Content-Range", "0-19/42"))
            else json(
                """[{"item_key":"en:u1l1:q1","lesson_id":"u1l1","level":"A1","ease":2.5,"interval_days":1,"repetitions":0,"due_on":"2025-09-16","source":"lesson","weakness_display":null,"prompt":null,"choices":null,"answer_index":null,"explanation":null}]""",
            )
        }
        val result = client(fake).fetchDueReviews("en")
        assertEquals(42, result.total)
        assertEquals(1, result.due.size)
        assertEquals("en:u1l1:q1", result.due[0].itemKey)
        assertEquals("lesson", result.due[0].source)
        val get = fake.seen[0]
        assertEquals("GET", get.method)
        assertEquals("/rest/v1/review_items", get.path)
        assertEquals("eq.en", get.query["language"])
        assertEquals("lte.2025-09-16", get.query["due_on"])
        assertEquals("due_on.asc", get.query["order"])
        assertEquals("20", get.query["limit"])
        val head = fake.seen[1]
        assertEquals("HEAD", head.method)
        assertEquals("count=exact", head.headers["Prefer"])
    }

    @Test
    fun `fetchDueReviews decodes weakness rows and defaults a missing source to lesson`() = runTest {
        val fake = FakeSupabase { req ->
            if (req.method == "HEAD") respond("", HttpStatusCode.OK, headersOf("Content-Range", "0-1/2"))
            else json(
                """[{"item_key":"weak:1","lesson_id":"u1l1","level":"A1","ease":2.5,"interval_days":1,"repetitions":0,"due_on":"2025-09-16","source":"weakness","weakness_display":"Articles","prompt":"Pick","choices":["a","an"],"answer_index":1,"explanation":"why"},
                    {"item_key":"en:u1l1:q2","lesson_id":"u1l1","level":"A1","ease":2.5,"interval_days":1,"repetitions":0,"due_on":"2025-09-16"}]""",
            )
        }
        val due = client(fake).fetchDueReviews("en").due
        assertEquals("weakness", due[0].source)
        assertEquals(listOf("a", "an"), due[0].choices)
        assertEquals(1, due[0].answerIndex)
        assertEquals("lesson", due[1].source)
        assertNull(due[1].choices)
    }

    @Test
    fun `gradeReview posts to the edge function and a missing correct field decodes as null`() = runTest {
        val fake = FakeSupabase { json("""{"retired":false,"dueOn":"2025-09-19"}""") }
        val outcome = client(fake).gradeReview("en:u1l1:q1", "cat", "en")
        assertEquals(ReviewGradeOutcome(false, "2025-09-19", null), outcome)
        assertEquals("/functions/v1/grade-review", fake.seen.single().path)
        assertEquals("""{"itemKey":"en:u1l1:q1","answer":"cat","course":"en"}""", fake.seen.single().body)
    }

    @Test
    fun `gradeReview carries the server verdict when present`() = runTest {
        val fake = FakeSupabase { json("""{"retired":true,"dueOn":"2025-09-16","correct":true}""") }
        assertEquals(ReviewGradeOutcome(true, "2025-09-16", true), client(fake).gradeReview("k", "a", "en"))
    }

    @Test
    fun `claimReviewClearBonus posts the course and returns the row`() = runTest {
        val fake = FakeSupabase { json("""[{"granted":true,"hearts":5}]""") }
        assertEquals(ReviewClearBonus(true, 5), client(fake).claimReviewClearBonus("fr"))
        assertEquals("""{"_course":"fr"}""", fake.seen.single().body)
    }

    @Test
    fun `fetchProgress composes both tables and does not call restore when no refill is due`() = runTest {
        val fake = FakeSupabase { req ->
            if (req.path.contains("language_progress")) json("""[{"xp":1234,"league_tier":"gold"}]""")
            else json("""[{"streak":7,"longest_streak":9,"last_active_date":"2026-09-24","hearts":3,"hearts_refill_at":"2099-09-24T01:23:45.678901+00:00","streak_freezes":2}]""")
        }
        val progress = client(fake).fetchProgress()!!
        assertEquals(1234, progress.xp)
        assertEquals("gold", progress.leagueTier)
        assertEquals(7, progress.streak)
        assertEquals(9, progress.longestStreak)
        assertEquals(3, progress.hearts)
        assertEquals(2, progress.streakFreezes)
        assertEquals("2026-09-24", progress.lastActiveDate)
        assertEquals(4093896225678.0, progress.heartsRefillAt!!, 1.0)
        assertEquals(2, fake.seen.size)
        assertEquals("updated_at.desc", fake.seen[0].query["order"])
        assertEquals("1", fake.seen[0].query["limit"])
    }

    @Test
    fun `fetchProgress resolves an elapsed refill via the restore rpc`() = runTest {
        val fake = FakeSupabase { req ->
            when {
                req.path.contains("language_progress") -> json("""[{"xp":10,"league_tier":"bronze"}]""")
                req.path.endsWith("restore_hearts_if_due") -> json("""[{"hearts":5,"hearts_refill_at":null}]""")
                else -> json("""[{"streak":1,"longest_streak":1,"last_active_date":"2025-09-15","hearts":0,"hearts_refill_at":"2025-09-16T05:00:00+00:00","streak_freezes":0}]""")
            }
        }
        val progress = client(fake).fetchProgress()!!
        assertEquals(5, progress.hearts)
        assertNull(progress.heartsRefillAt)
        assertTrue(fake.seen.any { it.path.endsWith("restore_hearts_if_due") })
    }

    @Test
    fun `fetchProgress returns null with no course row and defaults hearts to full with no user row`() = runTest {
        val none = FakeSupabase { json("[]") }
        assertNull(client(none).fetchProgress())
        val noUser = FakeSupabase { req ->
            if (req.path.contains("language_progress")) json("""[{"xp":1,"league_tier":"bronze"}]""") else json("[]")
        }
        assertEquals(5, client(noUser).fetchProgress()!!.hearts)
    }

    @Test
    fun `restoreHeartsIfDue parses the refill timestamp to epoch millis`() = runTest {
        val fake = FakeSupabase { json("""[{"hearts":1,"hearts_refill_at":"2025-09-16T06:00:00.123456+00:00"}]""") }
        val result = client(fake).restoreHeartsIfDue()
        assertEquals(1, result.hearts)
        assertEquals(1758002400123.0, result.heartsRefillAt!!, 1.0)
    }

    @Test
    fun `simple reads map rows and empty results`() = runTest {
        val ids = FakeSupabase { json("""[{"lesson_id":"u1l3"},{"lesson_id":"u1l1"}]""") }
        assertEquals(listOf("u1l3", "u1l1"), client(ids).fetchCompletedLessonIds("en"))
        assertEquals("completed_at.desc", ids.seen.single().query["order"])

        val level = FakeSupabase { json("""[{"cefr_level":"B2"}]""") }
        assertEquals("B2", client(level).fetchCefrLevel("en"))
        assertNull(client(FakeSupabase { json("[]") }).fetchCefrLevel("en"))

        val placement = FakeSupabase { json("""[{"placement_taken_at":null}]""") }
        assertNull(client(placement).fetchPlacementTakenAt("en"))
        assertEquals("2026-09-01T00:00:00+00:00", client(FakeSupabase { json("""[{"placement_taken_at":"2026-09-01T00:00:00+00:00"}]""") }).fetchPlacementTakenAt("en"))

        val achievements = FakeSupabase { json("""[{"achievement_id":"first_lesson","progress":1}]""") }
        assertEquals(listOf(UnlockedAchievement("first_lesson", 1)), client(achievements).fetchUnlockedAchievements())
    }

    @Test
    fun `theme reads and writes hit profiles by id`() = runTest {
        val fake = FakeSupabase { req -> if (req.method == "GET") json("""[{"theme":"canopy"}]""") else json("") }
        assertEquals("canopy", client(fake).fetchProfileTheme(userId))
        client(fake).updateProfileTheme("meadow", userId)
        assertEquals("eq.$userId", fake.seen[0].query["id"])
        assertEquals("PATCH", fake.seen[1].method)
        assertEquals("return=minimal", fake.seen[1].headers["Prefer"])
        assertEquals("""{"theme":"meadow"}""", fake.seen[1].body)
    }

    @Test
    fun `a 401 is retried once with a refreshed token`() = runTest {
        var refreshed = false
        val engineFake = FakeSupabase { req ->
            if (req.headers["Authorization"] == "Bearer fresh") json("""[{"hearts":4}]""") else json("""{"message":"JWT expired"}""", HttpStatusCode.Unauthorized)
        }
        val http = SupabaseHttp("https://example.supabase.co", "k", { "stale" }, engineFake.engine) { refreshed = true; "fresh" }
        assertEquals(HeartsResult(4), ProgressSyncClient(http) { now }.loseHeart())
        assertTrue(refreshed)
        assertEquals(2, engineFake.seen.size)
    }
}
