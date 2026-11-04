package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Lesson
import com.obsidianmedia.learnwithalphonso.core.content.Question
import com.obsidianmedia.learnwithalphonso.core.content.VocabImageRef
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class VocabDerivationTest {
    private val store by lazy {
        ContentStore { name -> checkNotNull(javaClass.getResourceAsStream("/$name")).bufferedReader().readText() }
    }

    @Test
    fun `derives terms from mc choices and fill answers of the real first lesson`() {
        val (_, lesson) = checkNotNull(store.findLesson("u1l1", Course.ENGLISH))
        val items = deriveVocab(lesson, store.vocabImages)
        assertEquals(
            listOf("Good morning.", "meet", "I am fine, thanks.", "Good", "Good night.", "Hey!", "later", "You're welcome."),
            items.map { it.term },
        )
        assertEquals("Nice to meet you.", items[1].example)
        assertEquals("", items[0].example) // a quiz stem is not a sentence
    }

    @Test
    fun `dedupes case-insensitively and keeps the first spelling`() {
        val lesson = Lesson(
            "l", "t", "s",
            listOf(
                Question.FillInBlank("a", "___ morning", listOf("Good"), "Good", "e1"),
                Question.FillInBlank("b", "___ night", listOf("good"), "good", "e2"),
                Question.MultipleChoice("c", "Pick:", listOf("GOOD", "bad"), 0, "e3"),
            ),
        )
        val items = deriveVocab(lesson, emptyMap())
        assertEquals(listOf("Good"), items.map { it.term })
        assertEquals("", items[0].meaning) // the quiz explanation is never the meaning
    }

    @Test
    fun `whole-sentence question types contribute nothing`() {
        val lesson = Lesson(
            "l", "t", "s",
            listOf(
                Question.Reorder("a", "p", listOf("I", "am"), "I am", "e"),
                Question.Listening("b", "p", "Hi", listOf("Hi", "Bye"), "Hi", "e"),
                Question.Speak("c", "p", "Hello there", "e"),
                Question.Translate("d", "p", listOf("Hello"), "e"),
            ),
        )
        assertTrue(deriveVocab(lesson, emptyMap()).isEmpty())
    }

    @Test
    fun `only a cloze sentence gives an example and no card shows the quiz explanation`() {
        val lesson = Lesson(
            "l", "t", "s",
            listOf(
                Question.FillInBlank("a", "Say hello", listOf("hi"), "hi", "e"),
                Question.MultipleChoice("b", "Choose the farewell: ", listOf("Bye", "Hi"), 0, "e"),
                Question.MultipleChoice("c", "She ___ happy.", listOf("is", "am"), 0, "e"),
                Question.MultipleChoice("d", "Plural of \"baby\": ___", listOf("babies", "x"), 0, "e"),
            ),
        )
        val items = deriveVocab(lesson, mapOf("bye" to VocabImageRef("u", "alt", "c")))
        assertEquals("", items[0].example)
        assertEquals("", items[1].example)
        assertEquals("She is happy.", items[2].example)
        assertEquals("", items[3].example)
        assertEquals(listOf("", "", "", ""), items.map { it.meaning })
        assertEquals("u", items[1].image?.url)
        assertNull(items[0].image)
    }
}
