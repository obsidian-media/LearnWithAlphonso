package com.obsidianmedia.learnwithalphonso.core.goal

import com.obsidianmedia.learnwithalphonso.core.content.ContentJson
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class GoalCacheTest {
    class MemoryStore : GoalCacheStore {
        val map = HashMap<String, String>()
        override fun get(key: String): String? = map[key]
        override fun put(key: String, value: String) { map[key] = value }
        override fun remove(key: String) { map.remove(key) }
    }

    private val fixtures: JsonObject = ContentJson.json
        .parseToJsonElement(javaClass.getResource("/learning-goal.fixtures.json")!!.readText()).jsonObject

    private fun stored(): LearningGoalState = LearningGoalDecoding.state(fixtures["envelopes"]!!.jsonObject["stored"].toString())
    private fun envelope(key: String): String = fixtures["envelopes"]!!.jsonObject[key].toString()

    @Test
    fun `round trips a state exactly`() {
        val cache = GoalCache(MemoryStore())
        val state = stored()
        cache.write(state, "u1", "en")
        assertEquals(state, cache.read("u1", "en"))
    }

    @Test
    fun `every status and realism survives the round trip`() {
        val cache = GoalCache(MemoryStore())
        val base = stored()
        val statuses = GoalStatus.entries
        val realisms = GoalRealism.entries
        statuses.forEachIndexed { i, status ->
            val plan = base.plan!!.copy(
                status = status,
                realism = realisms[i % realisms.size],
                suggestedDate = if (i % 2 == 0) "2026-11-10" else null,
            )
            val state = LearningGoalState(base.goal, plan)
            cache.write(state, "u1", "en")
            assertEquals(state, cache.read("u1", "en"), "$status")
        }
    }

    @Test
    fun `another user or course reads nothing`() {
        val cache = GoalCache(MemoryStore())
        cache.write(stored(), "u1", "en")
        assertNull(cache.read("u2", "en"))
        assertNull(cache.read("u1", "fr"))
    }

    @Test
    fun `clear removes it`() {
        val cache = GoalCache(MemoryStore())
        cache.write(stored(), "u1", "en")
        cache.clear("u1", "en")
        assertNull(cache.read("u1", "en"))
    }

    @Test
    fun `corrupt data reads as nothing`() {
        val store = MemoryStore()
        store.put(GoalCache.key("u1", "en"), "{not json")
        assertNull(GoalCache(store).read("u1", "en"))
    }

    @Test
    fun `a state without a goal or without a plan is not cached and clears the old entry`() {
        val cache = GoalCache(MemoryStore())
        val full = stored()
        cache.write(full, "u1", "en")
        cache.write(LearningGoalState(full.goal, null), "u1", "en")
        assertNull(cache.read("u1", "en"))
        cache.write(full, "u1", "en")
        cache.write(LearningGoalState(null, null), "u1", "en")
        assertNull(cache.read("u1", "en"))
    }

    @Test
    fun `an entry with a goal but no plan reads as nothing`() {
        // e.g. written by some other version: the cache must still refuse to show half a state.
        val store = MemoryStore()
        store.put(GoalCache.key("u1", "en"), envelope("stored_plan_null"))
        assertNull(GoalCache(store).read("u1", "en"))
    }

    @Test
    fun `a null or blank user id never reads or writes`() {
        val store = MemoryStore()
        val cache = GoalCache(store)
        cache.write(stored(), null, "en")
        cache.write(stored(), "  ", "en")
        assertTrue(store.map.isEmpty())
        store.put(GoalCache.key("anon", "en"), envelope("stored"))
        assertNull(cache.read(null, "en"))
        assertNull(cache.read("", "en"))
    }

    @Test
    fun `the key includes the user`() {
        assertNotEquals(GoalCache.key("a", "en"), GoalCache.key("b", "en"))
        assertTrue(GoalCache.key("user-xyz", "en").contains("user-xyz"))
        assertNotNull(GoalCache.key("a", "en"))
    }
}
