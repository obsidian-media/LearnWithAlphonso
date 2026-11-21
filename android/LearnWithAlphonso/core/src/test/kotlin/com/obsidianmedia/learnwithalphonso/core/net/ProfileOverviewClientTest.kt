package com.obsidianmedia.learnwithalphonso.core.net

import com.obsidianmedia.learnwithalphonso.core.net.FakeSupabase.Companion.json
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileLeagueStanding
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileLearningDay
import com.obsidianmedia.learnwithalphonso.core.profile.ProfileSkillDay
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import io.ktor.client.engine.mock.respond
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ProfileOverviewClientTest {
    private val now = 1_758_000_000_000L // 2025-09-16, a Tuesday
    private fun client(fake: FakeSupabase) = ProgressSyncClient(fake.http) { now }

    private fun fake(leagueFails: Boolean = false) = FakeSupabase { req ->
        when {
            req.path.endsWith("learning_days") -> json("""[{"day":"2025-09-15","lesson_seconds":120,"practice_seconds":60}]""")
            req.path.endsWith("mastered_words") -> respond(
                """[{"item_key":"a"}]""", HttpStatusCode.OK,
                headersOf(HttpHeaders.ContentType to listOf(ContentType.Application.Json.toString()), "Content-Range" to listOf("0-0/7")),
            )
            req.path.endsWith("get_my_league_standing") ->
                if (leagueFails) json("""{"message":"boom"}""", HttpStatusCode.InternalServerError)
                else json("""[{"league_tier":"silver","rank":3,"size":20,"week_start":"2025-09-15","week_end":"2025-09-21","week_xp":210}]""")
            req.path.endsWith("learner_time_zones") -> json("""[{"time_zone":"Europe/Paris"}]""")
            req.path.endsWith("skill_days") -> json("""[{"day":"2025-09-16","skill":"grammar","right_answers":4,"total_answers":5}]""")
            req.path.endsWith("language_progress") -> json("""[{"language":"fr","xp":50,"cefr_level":"A2","league_tier":"silver"}]""")
            else -> json("[]")
        }
    }

    @Test
    fun `the profile data reads are decoded with the course and day filters`() = runTest {
        val f = fake()
        val o = client(f).fetchProfileOverview("u1", "fr", now)
        assertEquals(listOf(ProfileLearningDay("2025-09-15", 120, 60)), o.learning)
        assertEquals(7, o.masteredWords)
        assertEquals(ProfileLeagueStanding("silver", 3, 20, "2025-09-15", "2025-09-21", 210), o.league)
        assertEquals("Europe/Paris", o.timeZone)
        assertEquals(listOf(ProfileSkillDay("2025-09-16", "grammar", 4, 5)), o.skills)
        assertEquals("gte.2025-09-15", f.seen.first { it.path.endsWith("learning_days") }.query["day"])
        // A day earlier than the 28-day window: the stored zone's today can be a day behind this device's.
        assertEquals("gte.2025-08-19", f.seen.first { it.path.endsWith("skill_days") }.query["day"])
        val mastered = f.seen.first { it.path.endsWith("mastered_words") }
        assertEquals("eq.fr", mastered.query["language"])
        assertEquals("eq.u1", mastered.query["user_id"])
        assertEquals("count=exact", mastered.headers["Prefer"])
        assertEquals("""{"_course":"fr"}""", f.seen.first { it.path.endsWith("get_my_league_standing") }.body)
        assertEquals("eq.u1", f.seen.first { it.path.endsWith("learner_time_zones") }.query["user_id"])
    }

    @Test
    fun `a failing league rpc leaves the rest of the profile intact`() = runTest {
        val o = client(fake(leagueFails = true)).fetchProfileOverview("u1", "fr", now)
        assertNull(o.league)
        assertEquals(7, o.masteredWords)
        assertEquals("Europe/Paris", o.timeZone)
        assertEquals(1, o.skills.size)
        assertEquals(1, o.learning.size)
        assertEquals(listOf("fr"), o.courses.map { it.course })
    }

    @Test
    fun `an empty profile data response gives empty defaults`() = runTest {
        val o = client(FakeSupabase { json("[]") }).fetchProfileOverview("u1", "fr", now)
        // No stored zone: the server books the UTC date, so Profile's today is that date too, on any device.
        assertEquals("2025-09-16", o.today)
        assertEquals("2025-09-16", o.localToday)
        assertEquals(0, o.masteredWords)
        assertNull(o.league)
        assertNull(o.timeZone)
        assertEquals(emptyList<ProfileSkillDay>(), o.skills)
    }

    // Final QA 2026-11-21: at Friday 19:21 in Los Angeles (Saturday 03:21 UTC) the week strip said Saturday "not yet
    // today". The streak books the learner's local day, so Profile's today is the local day in the stored zone.
    @Test
    fun `today is the local day in the stored zone so the week strip matches the streak`() = runTest {
        val fridayEvening = java.time.Instant.parse("2026-11-21T03:21:00Z").toEpochMilli()
        val f = FakeSupabase { req ->
            if (req.path.endsWith("learner_time_zones")) json("""[{"time_zone":"America/Los_Angeles"}]""") else json("[]")
        }
        val o = ProgressSyncClient(f.http) { fridayEvening }.fetchProfileOverview("u1", "fr", fridayEvening)
        assertEquals("2026-11-20", o.today)
        assertEquals("2026-11-20", o.localToday) // the header streak reads the same day
        val week = com.obsidianmedia.learnwithalphonso.core.profile.ProfileMath.weekRings(o.today, emptyList(), emptyList())
        assertEquals(4, week.days.indexOfFirst { it.state == com.obsidianmedia.learnwithalphonso.core.profile.ProfileMath.RingState.TODAY }) // Friday
    }
}
