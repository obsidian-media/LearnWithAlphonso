package com.obsidianmedia.learnwithalphonso.core.content

import kotlinx.serialization.SerializationException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ContentDecodingTest {
    private fun resource(name: String): String =
        checkNotNull(javaClass.getResourceAsStream("/$name")) { "missing test resource $name" }
            .bufferedReader().readText()

    private val store by lazy { ContentStore(::resource) }

    @Test
    fun `decodes every bundled course and finds a lesson`() {
        assertEquals("en", store.bundle(Course.ENGLISH).course)
        val (unit, lesson) = checkNotNull(store.findLesson("u1l1", Course.ENGLISH))
        assertEquals("u1", unit.id)
        assertEquals("Saying Hello", lesson.title)
        assertTrue(lesson.questions.first() is Question.MultipleChoice)
        assertTrue(store.bundle(Course.FRENCH).units.isNotEmpty())
        assertTrue(store.bundle(Course.SPANISH).units.isNotEmpty())
        assertEquals(5, store.placementPool(Course.ENGLISH).map { it.level }.distinct().size)
        assertTrue(store.achievements.size >= 25)
        // The server-granted team mission badge (category "team": no client stat, lessons can never unlock it).
        val team = store.achievements.single { it.id == "team_player" }
        assertEquals("Team player", team.title)
        assertEquals("team", team.category)
        assertEquals(1, team.threshold)
        assertTrue(store.vocabImages.containsKey("doctor"))
    }

    @Test
    fun `every question type in the english bundle decodes to its own case`() {
        val kinds = store.bundle(Course.ENGLISH).units
            .flatMap { it.lessons }
            .flatMap { it.questions }
            .map { it::class.simpleName }
            .toSet()
        assertEquals(
            setOf("MultipleChoice", "FillInBlank", "Reorder", "Listening", "Speak", "Translate"),
            kinds,
        )
    }

    @Test
    fun `an unknown question type fails loudly instead of being skipped`() {
        val json = """
            {"course":"en","units":[{"id":"u","level":"A1","eyebrow":"e","title":"t","description":"d",
             "lessons":[{"id":"l","title":"t","subtitle":"s",
               "questions":[{"id":"q1","type":"hologram","prompt":"p","explanation":"x"}]}]}]}
        """.trimIndent()
        assertThrows(SerializationException::class.java) {
            ContentJson.json.decodeFromString(ContentBundle.serializer(), json)
        }
    }

    @Test
    fun `listening answer is text and mc answer is an index`() {
        val questions = store.bundle(Course.ENGLISH).units.flatMap { it.lessons }.flatMap { it.questions }
        val listening = questions.filterIsInstance<Question.Listening>().first()
        assertTrue(listening.choices.contains(listening.answer))
        val mc = questions.filterIsInstance<Question.MultipleChoice>().first()
        assertTrue(mc.answer in mc.choices.indices)
    }

    @Test
    fun `placement pools decode for every course with every band present`() {
        for (course in Course.entries) {
            val levels = store.placementPool(course).map { it.level }.toSet()
            assertEquals(placementOrder.toSet(), levels, "bands for ${course.code}")
        }
    }

    @Test
    fun `vocab image provenance decodes when present and is null when absent`() {
        val full = ContentJson.json.decodeFromString(
            VocabImageRef.serializer(),
            """{"url":"u","alt":"a","credit":"c","source":"pexels","sourcePageUrl":"https://www.pexels.com/photo/x-1/","license":"Pexels License (https://www.pexels.com/license/)","reviewedBy":"agent:w1-review-r1-b001","reviewedAt":"2026-10-08"}""",
        )
        assertEquals("pexels", full.source)
        assertEquals("agent:w1-review-r1-b001", full.reviewedBy)
        assertEquals("2026-10-08", full.reviewedAt)

        val legacy = ContentJson.json.decodeFromString(VocabImageRef.serializer(), """{"url":"u","alt":"a","credit":"c"}""")
        assertNull(legacy.source)
        assertEquals(VocabImageRef("u", "a", "c"), legacy)
    }
}
