package com.obsidianmedia.learnwithalphonso.ui.learn

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.MemorySyncStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import com.obsidianmedia.learnwithalphonso.testContent
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class LearnViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private fun server(level: String? = "B1", completed: List<String> = listOf("u1l2", "u1l1"), placementTaken: Boolean = true) = FakeServer { req ->
        when {
            req.query["select"] == "cefr_level" -> json(if (level == null) "[]" else """[{"cefr_level":"$level"}]""")
            req.query["select"] == "lesson_id" -> json(completed.joinToString(",", "[", "]") { """{"lesson_id":"$it"}""" })
            req.query["select"] == "placement_taken_at" -> json(if (placementTaken) """[{"placement_taken_at":"2026-01-01T00:00:00+00:00"}]""" else """[{"placement_taken_at":null}]""")
            req.path.endsWith("get_weekly_challenges") -> json("""[{"template_id":"t1","title":"Finish 5 lessons","description":"d","progress":5,"threshold":5,"completed":false}]""")
            req.path.endsWith("claim_weekly_quest") -> json("""[{"ok":true,"xp":100}]""")
            req.path.endsWith("buy_streak_freeze_with_xp") -> json("""[{"ok":false,"streak_freezes":1}]""")
            req.path.contains("language_progress") -> json("""[{"xp":900,"league_tier":"silver"}]""")
            req.path.contains("user_progress") -> json("""[{"streak":2,"longest_streak":2,"last_active_date":"2026-09-29","hearts":5,"hearts_refill_at":null,"streak_freezes":1}]""")
            else -> json("")
        }
    }

    @Test
    fun `loads the saved level, completion dots, continue target and placement flag`() = runBlocking {
        val store = MemorySyncStore()
        val v = LearnViewModel(testContent, server().progressClient, store)
        awaitTrue("loaded") { v.state.value.placementTaken != null }
        val s = v.state.value
        assertEquals("B1", s.selectedLevel)
        assertEquals(setOf("u1l1", "u1l2"), s.completedLessonIds)
        assertEquals("u1l2", s.mostRecentlyCompletedLessonId)
        assertEquals(true, s.placementTaken)
        assertNull("continue target is in A1, not the selected B1 band", s.continueLessonId(testContent))
        v.selectLevel("A1")
        assertEquals("u1l3", v.state.value.continueLessonId(testContent))
    }

    @Test
    fun `an untaken placement and a missing level fall back to A1 and show the banner`() = runBlocking {
        val v = LearnViewModel(testContent, server(level = null, completed = emptyList(), placementTaken = false).progressClient, MemorySyncStore())
        awaitTrue("loaded") { v.state.value.placementTaken != null }
        assertEquals("A1", v.state.value.selectedLevel)
        assertEquals(false, v.state.value.placementTaken)
        assertTrue(v.state.value.completedLessonIds.isEmpty())
    }

    @Test
    fun `switching course reloads and the review badge follows the cache`() = runBlocking {
        val s = server()
        val store = MemorySyncStore()
        val v = LearnViewModel(testContent, s.progressClient, store)
        awaitTrue("loaded") { v.state.value.placementTaken != null }
        v.selectCourse(Course.FRENCH)
        awaitTrue("reloaded for fr") { v.state.value.course == Course.FRENCH && v.state.value.placementTaken != null }
        assertEquals(Course.FRENCH, v.state.value.course)
        assertTrue(s.seen.any { it.query["language"] == "eq.fr" })
        assertTrue(v.state.value.unitsForLevel(testContent).all { it.level == v.state.value.selectedLevel })
        store.replaceLastKnownDueReviews(List(120) { ReviewItem("k$it", "u1l1", "A1", 2.5, 1, 0, "2026-01-01") })
        awaitTrue("badge") { v.dueBadge.value == "99+" }
        assertEquals(120, v.dueCount.value)
    }

    @Test
    fun `challenges load and a claim posts this week's monday then refreshes progress`() = runBlocking {
        val s = server()
        val store = MemorySyncStore()
        val v = LearnViewModel(testContent, s.progressClient, store) { 1_790_726_400_000L } // Wed 2026-09-30
        awaitTrue("loaded") { v.state.value.challenges.isNotEmpty() }
        v.claimChallenge(v.state.value.challenges.single())
        awaitTrue("claimed") { v.state.value.notice == "+100 XP claimed!" }
        assertEquals("""{"_quest_id":"t1","_course":"en","_week_start":"2026-09-28"}""", s.seen.first { it.path.endsWith("claim_weekly_quest") }.body)
        assertTrue(v.state.value.claimedChallengeIds.contains("t1"))
        awaitTrue("progress refreshed") { store.progress.value?.xp == 900 }
    }

    @Test
    fun `an insufficient-xp streak freeze purchase explains the cost`() = runBlocking {
        val v = LearnViewModel(testContent, server().progressClient, MemorySyncStore())
        awaitTrue("loaded") { v.state.value.placementTaken != null }
        v.buyStreakFreeze()
        awaitTrue("notice") { v.state.value.notice != null }
        assertEquals("Not enough XP. A streak freeze costs 50 XP.", v.state.value.notice)
    }

    @Test
    fun `selecting a level saves it to the server without blocking`() = runBlocking {
        val s = server()
        val v = LearnViewModel(testContent, s.progressClient, MemorySyncStore())
        awaitTrue("loaded") { v.state.value.placementTaken != null }
        v.selectLevel("C1")
        assertEquals("C1", v.state.value.selectedLevel)
        awaitTrue("level saved") { s.seen.any { it.path.endsWith("set_cefr_level") && it.body == """{"_language":"en","_level":"C1"}""" } }
    }
}
