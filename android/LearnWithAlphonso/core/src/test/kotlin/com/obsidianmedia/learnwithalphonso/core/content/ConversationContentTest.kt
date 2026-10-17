package com.obsidianmedia.learnwithalphonso.core.content

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ConversationContentTest {
    private fun resource(name: String): String =
        checkNotNull(javaClass.getResourceAsStream("/$name")) { "missing test resource $name" }.bufferedReader().readText()

    private val store by lazy { ContentStore(::resource) }

    @Test
    fun `every course has the same scenarios and campaigns, in its own language`() {
        val en = store.scenarios(Course.ENGLISH)
        assertTrue(en.isNotEmpty())
        for (course in listOf(Course.FRENCH, Course.SPANISH)) {
            val localized = store.scenarios(course)
            assertEquals(en.map { it.id }, localized.map { it.id }, "${course.code} scenario ids and order")
            localized.zip(en).forEach { (loc, eng) ->
                assertNotEquals(eng.title, loc.title, "${course.code} ${loc.id} title is in the target language")
                assertNotEquals(eng.systemPrompt, loc.systemPrompt, "${course.code} ${loc.id} prompt")
                assertNotEquals(eng.opener, loc.opener, "${course.code} ${loc.id} opener")
                assertTrue(loc.opener.isNotBlank() && loc.systemPrompt.isNotBlank() && loc.title.isNotBlank())
                assertEquals(eng.emoji, loc.emoji)
                assertEquals(eng.level, loc.level)
            }
            val camps = store.campaigns(course)
            assertEquals(store.campaigns(Course.ENGLISH).map { it.id }, camps.map { it.id }, "${course.code} campaign ids")
            camps.zip(store.campaigns(Course.ENGLISH)).forEach { (loc, eng) ->
                assertEquals(eng.scenes.size, loc.scenes.size)
                assertNotEquals(eng.premise, loc.premise)
                loc.scenes.zip(eng.scenes).forEach { (ls, es) ->
                    assertNotEquals(es.opener, ls.opener)
                    assertEquals(es.minTurns, ls.minTurns)
                }
            }
        }
    }

    @Test
    fun `the English scenarios are the ones every earlier build sends`() {
        // The server only accepts a system prompt it knows; the English file must stay as it was.
        assertEquals(store.scenarios(Course.ENGLISH), store.scenarios)
        assertEquals(store.campaigns(Course.ENGLISH), store.campaigns)
        assertTrue(store.scenarios.first().systemPrompt.startsWith("You are "))
    }

    @Test
    fun `the French and Spanish prompts carry no safety text, the server adds it`() {
        for (course in listOf(Course.FRENCH, Course.SPANISH)) {
            store.scenarios(course).forEach { assertFalse(it.systemPrompt.contains("SAFETY"), "${course.code} ${it.id}") }
        }
    }
}

class ActiveCourseStoreTest {
    private class MapStore : CourseKeyValueStore {
        val map = HashMap<String, String>()
        override fun get(key: String) = map[key]
        override fun put(key: String, value: String) { map[key] = value }
    }

    @Test
    fun `English until an account chooses, then that account's own choice`() {
        val kv = MapStore()
        val s = ActiveCourseStore(kv)
        assertEquals(Course.ENGLISH, s.course.value)
        s.accountChanged("a")
        s.set(Course.FRENCH)
        assertEquals("fr", kv.map["activeCourse.a"])
        s.accountChanged("b")
        assertEquals(Course.ENGLISH, s.course.value, "another account starts in English")
        s.set(Course.SPANISH)
        s.accountChanged("a")
        assertEquals(Course.FRENCH, s.course.value)
        s.accountChanged("b")
        assertEquals(Course.SPANISH, s.course.value)
    }

    @Test
    fun `nothing is remembered while signed out and an unknown code falls back to English`() {
        val kv = MapStore()
        val s = ActiveCourseStore(kv)
        s.set(Course.FRENCH)
        assertTrue(kv.map.isEmpty())
        kv.map["activeCourse.a"] = "de"
        s.accountChanged("a")
        assertEquals(Course.ENGLISH, s.course.value)
        s.accountChanged(null)
        assertEquals(Course.ENGLISH, s.course.value)
        assertNull(kv.map["activeCourse.null"])
    }
}
