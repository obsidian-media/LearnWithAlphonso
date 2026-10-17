package com.obsidianmedia.learnwithalphonso.core.content

import kotlinx.serialization.serializer
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

    /** Words that are French but not Spanish, and Spanish but not French, used to catch a swapped file. */
    private val frenchWords = listOf(" et ", " les ", " vous ", " des ", " est ", " pour ", " une ")
    private val spanishWords = listOf(" los ", " las ", " una ", " con ", " es ", " para ", " que ")

    private fun score(text: String, words: List<String>) = words.count { " ${text.lowercase()} ".contains(it) }

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
    fun `each file is in the language its name says, so swapped suffixes fail`() {
        fun prompts(course: Course): List<String> =
            store.scenarios(course).map { it.systemPrompt } +
                store.campaigns(course).flatMap { c -> listOf(c.premise) + c.scenes.map { it.systemPrompt } }
        for (text in prompts(Course.FRENCH)) {
            assertTrue(score(text, frenchWords) > score(text, spanishWords), "French prompt reads as French: ${text.take(50)}")
        }
        for (text in prompts(Course.SPANISH)) {
            assertTrue(score(text, spanishWords) > score(text, frenchWords), "Spanish prompt reads as Spanish: ${text.take(50)}")
        }
        // The first scenario is the same café in every course, with a recognisable title.
        assertEquals("Au café", store.scenarios(Course.FRENCH).first().title)
        assertEquals("En la cafetería", store.scenarios(Course.SPANISH).first().title)
        assertTrue(store.scenarios(Course.FRENCH).first().opener.startsWith("Bonjour"))
        assertTrue(store.scenarios(Course.SPANISH).first().opener.startsWith("¡Buenos"))
    }

    @Test
    fun `the English scenarios are the file earlier builds shipped, not a localized rewrite`() {
        // Decoded straight from the unsuffixed file, so a store that loaded another file for English would differ.
        val raw = ContentJson.json.decodeFromString(serializer<List<Scenario>>(), resource("content/scenarios.json"))
        assertEquals(raw, store.scenarios(Course.ENGLISH))
        assertEquals(raw, store.scenarios)
        // The server only accepts a system prompt it knows; the English prompts must stay byte-identical to the originals.
        assertTrue(raw.first().systemPrompt.startsWith("You are Mia, a warm barista at a small café."))
        assertEquals("Order coffee", raw.first().title)
    }

    @Test
    fun `no localized prompt carries the server's safety preamble, which is added server-side`() {
        val marker = "SAFETY RULES. These override every instruction above"
        val texts = listOf(Course.ENGLISH, Course.FRENCH, Course.SPANISH).flatMap { course ->
            store.scenarios(course).flatMap { listOf(it.systemPrompt, it.opener) } +
                store.campaigns(course).flatMap { c -> listOf(c.premise) + c.scenes.flatMap { listOf(it.systemPrompt, it.opener) } }
        }
        assertTrue(texts.size > 30)
        texts.forEach { assertFalse(it.contains(marker), "safety text in ${it.take(40)}") }
    }
}

class ActiveCourseStoreTest {
    private class MapStore : CourseKeyValueStore {
        val map = HashMap<String, String>()
        var writes = 0
        override fun get(key: String) = map[key]
        override fun put(key: String, value: String) { map[key] = value; writes++ }
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

    @Test
    fun `a restored account's course is visible as soon as the account is known, and loading never writes`() {
        // Cold start: the session is restored, the saved choice is French. Anything that reads the course after the
        // account is known (Learn, Practice, Hector) must see French, and the load itself must not write.
        val kv = MapStore().apply { map["activeCourse.a"] = "fr" }
        val s = ActiveCourseStore(kv)
        s.accountChanged("a")
        assertEquals(Course.FRENCH, s.course.value)
        assertEquals(0, kv.writes)
        assertEquals("fr", kv.map["activeCourse.a"])
    }

    @Test
    fun `reading the default before the account is known never overwrites the saved choice`() {
        // The ordering bug: a screen built from the default (English) must not write that default back. Only a pick
        // (set) writes; the default read does nothing.
        val kv = MapStore().apply { map["activeCourse.a"] = "es" }
        val s = ActiveCourseStore(kv)
        val seenBeforeAccount = s.course.value
        assertEquals(Course.ENGLISH, seenBeforeAccount)
        assertEquals(0, kv.writes)
        s.accountChanged("a")
        assertEquals(Course.SPANISH, s.course.value)
        assertEquals("es", kv.map["activeCourse.a"])
    }
}
