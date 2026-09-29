package com.obsidianmedia.learnwithalphonso.ui.learn

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.MemorySyncStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.net.ReviewItem
import com.obsidianmedia.learnwithalphonso.testContent
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LearnViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private fun server(level: String? = "B1", completed: List<String> = listOf("u1l2", "u1l1"), placementTaken: Boolean = true) = FakeServer { req ->
        when {
            req.query["select"] == "cefr_level" -> json(if (level == null) "[]" else """[{"cefr_level":"$level"}]""")
            req.query["select"] == "lesson_id" -> json(completed.joinToString(",", "[", "]") { """{"lesson_id":"$it"}""" })
            req.query["select"] == "placement_taken_at" -> json(if (placementTaken) """[{"placement_taken_at":"2026-01-01T00:00:00+00:00"}]""" else """[{"placement_taken_at":null}]""")
            else -> json("")
        }
    }

    @Test
    fun `loads the saved level, completion dots, continue target and placement flag`() = runTest {
        val store = MemorySyncStore()
        val v = LearnViewModel(testContent, server().progressClient, store)
        advanceUntilIdle()
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
    fun `an untaken placement and a missing level fall back to A1 and show the banner`() = runTest {
        val v = LearnViewModel(testContent, server(level = null, completed = emptyList(), placementTaken = false).progressClient, MemorySyncStore())
        advanceUntilIdle()
        assertEquals("A1", v.state.value.selectedLevel)
        assertEquals(false, v.state.value.placementTaken)
        assertTrue(v.state.value.completedLessonIds.isEmpty())
    }

    @Test
    fun `switching course reloads and the review badge follows the cache`() = runTest {
        val s = server()
        val store = MemorySyncStore()
        val v = LearnViewModel(testContent, s.progressClient, store)
        advanceUntilIdle()
        v.selectCourse(Course.FRENCH)
        advanceUntilIdle()
        assertEquals(Course.FRENCH, v.state.value.course)
        assertTrue(s.seen.any { it.query["language"] == "eq.fr" })
        assertTrue(v.state.value.unitsForLevel(testContent).all { it.level == v.state.value.selectedLevel })
        store.replaceLastKnownDueReviews(List(120) { ReviewItem("k$it", "u1l1", "A1", 2.5, 1, 0, "2026-01-01") })
        advanceUntilIdle()
        assertEquals("99+", v.dueBadge.value)
        assertEquals(120, v.dueCount.value)
    }

    @Test
    fun `selecting a level saves it to the server without blocking`() = runTest {
        val s = server()
        val v = LearnViewModel(testContent, s.progressClient, MemorySyncStore())
        advanceUntilIdle()
        v.selectLevel("C1")
        assertEquals("C1", v.state.value.selectedLevel)
        advanceUntilIdle()
        assertTrue(s.seen.any { it.path.endsWith("set_cefr_level") && it.body == """{"_language":"en","_level":"C1"}""" })
    }
}
