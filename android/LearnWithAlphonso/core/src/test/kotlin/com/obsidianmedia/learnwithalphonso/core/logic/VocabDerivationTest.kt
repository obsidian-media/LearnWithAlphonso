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
        // "Good morning." is a quiz stem with no blank, so its example comes from the authored field.
        assertEquals("Good morning, class. Please sit down.", items[0].example)
        assertEquals("a polite greeting used before noon", items[0].meaning)
    }

    @Test
    fun `an authored meaning and example are used, and a missing example keeps the cloze sentence`() {
        val lesson = Lesson(
            "l", "t", "s",
            listOf(
                Question.MultipleChoice(
                    "a", "Plural of \"child\": ___", listOf("children", "childs"), 0, "e",
                    meaning = "more than one child", example = "The children play outside.",
                ),
                Question.FillInBlank(
                    "b", "I ___ to the store.", listOf("go", "went"), "went", "e",
                    meaning = " moved to a place in the past ",
                ),
            ),
        )
        val items = deriveVocab(lesson, emptyMap())
        assertEquals(VocabItem("children", "more than one child", "The children play outside.", null), items[0])
        assertEquals(VocabItem("went", "moved to a place in the past", "I went to the store.", null), items[1])
    }

    @Test
    fun `every bundled English A1 card has a meaning and an example`() {
        val a1 = store.bundle(Course.ENGLISH).units.filter { it.level == "A1" }.flatMap { it.lessons }
        assertTrue(a1.isNotEmpty())
        for (lesson in a1) for (item in deriveVocab(lesson, store.vocabImages)) {
            assertTrue(item.meaning.isNotEmpty(), "${lesson.id} ${item.term} has no meaning")
            assertTrue(item.example.isNotEmpty(), "${lesson.id} ${item.term} has no example")
        }
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

    @Test
    fun `tidies the sentence - no space before punctuation, capital first letter, no bracket hint`() {
        fun example(prompt: String, answer: String): String =
            deriveVocab(
                Lesson("l", "t", "s", listOf(Question.MultipleChoice("q", prompt, listOf(answer, "x", "y"), 0, "e"))),
                emptyMap(),
            )[0].example
        assertEquals("Is this seat taken?", example("Is this seat ___ ?", "taken"))
        assertEquals("While we were talking, the phone rang.", example("While we ___ , the phone rang.", "were talking"))
        assertEquals("May I open the window, please?", example("___ I open the window, please?", "may"))
        assertEquals("Je bois de l'eau.", example("Je ___ (boire) de l'eau.", "bois"))
        assertEquals("It's half past six.", example("It's ___ past six. (30 min)", "half"))
        assertEquals("Excusez-moi, où est la gare ? Et vous?", example("Excusez-moi, où est la gare ? Et ___ ?", "vous"))
    }
}
