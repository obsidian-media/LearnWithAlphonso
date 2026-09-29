package com.obsidianmedia.learnwithalphonso.ui.achievements

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.testContent
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test

class AchievementsViewModelTest {
    @get:Rule val main = MainDispatcherRule()

    private fun server(unlockOk: Boolean) = FakeServer { req ->
        when {
            req.path.endsWith("user_achievements") -> if (unlockOk) json("""[{"achievement_id":"first_lesson","progress":1}]""") else json("""{"message":"down"}""", HttpStatusCode.InternalServerError)
            req.path.endsWith("weakness_events") -> json("""[{"category":"plurals","event_type":"detected","created_at":"2026-09-01T00:00:00+00:00"},{"category":"plurals","event_type":"resolved","created_at":"2026-09-02T00:00:00+00:00"},{"category":"articles","event_type":"detected","created_at":"2026-08-01T00:00:00+00:00"}]""")
            else -> json("[]")
        }
    }

    @Test
    fun `unlocked ids and trend load, open entries first`() = runBlocking {
        val v = AchievementsViewModel(testContent, server(true).progressClient)
        awaitTrue("loaded") { !v.state.value.isLoading }
        assertEquals(setOf("first_lesson"), v.state.value.unlockedById.keys)
        assertEquals(listOf("articles", "plurals"), v.state.value.weaknessTrend.map { it.category })
        assertNull(v.state.value.error)
        assertNotNull(v.content.achievements.firstOrNull())
    }

    @Test
    fun `a failed unlock fetch keeps the catalog and explains`() = runBlocking {
        val v = AchievementsViewModel(testContent, server(false).progressClient)
        awaitTrue("loaded") { !v.state.value.isLoading }
        assertEquals(0, v.state.value.unlockedById.size)
        assertEquals("Couldn't load your unlock status. Showing the full catalog.", v.state.value.error)
        assertEquals(2, v.state.value.weaknessTrend.size)
    }
}
