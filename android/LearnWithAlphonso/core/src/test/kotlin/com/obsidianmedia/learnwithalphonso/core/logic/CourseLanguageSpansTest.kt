package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.content.ContentStore
import com.obsidianmedia.learnwithalphonso.core.content.Course
import com.obsidianmedia.learnwithalphonso.core.content.Question
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Twin of src/lib/course-language-spans.test.ts and CourseLanguageSpansTests.swift: the same rules and the same cases. */
class CourseLanguageSpansTest {
    private fun resource(name: String): String =
        checkNotNull(javaClass.getResourceAsStream("/$name")) { "missing test resource $name" }.bufferedReader().readText()

    private fun fill(prompt: String, answer: String, explanation: String) =
        Question.FillInBlank(id = "q", prompt = prompt, bank = listOf(answer, "x"), answer = answer, explanation = explanation)

    private fun spans(q: Question) = CourseLanguageSpans.spans(q, q.explanation)

    @Test
    fun `takes the target after the arrow when the prompt names the language`() {
        val e = "hello (informal) → Salut. Core greetings."
        assertEquals(listOf("Salut"), spans(fill("How do you say \"hello\" in French? ___", "Salut", e)))
    }

    @Test
    fun `does not take the answer when the prompt does not name the direction`() {
        val e = "tomber → \"to faint\". Idioms."
        assertEquals(emptyList<String>(), spans(fill("The idiom \"tomber dans les pommes\" means… ___", "to faint", e)))
    }

    @Test
    fun `does not take the answer of a prompt that names the language but asks for English`() {
        val e = "pain → \"bread\". Words."
        assertEquals(emptyList<String>(), spans(fill("The French word \"pain\" (a false friend) actually means… ___", "bread", e)))
    }

    @Test
    fun `takes a multiple choice answer by index`() {
        val e = "goodbye → Au revoir. Greetings."
        val q = Question.MultipleChoice(
            id = "q", prompt = "The French word for \"goodbye\" is…", choices = listOf("Bonsoir", "Au revoir"), answer = 1, explanation = e,
        )
        assertEquals(listOf("Au revoir"), spans(q))
    }

    @Test
    fun `takes quoted course text for translate, listening and speak`() {
        val t = "One way to say it: \"Bonjour.\" Everyday ideas."
        assertEquals(
            listOf("Bonjour."),
            spans(Question.Translate(id = "q", prompt = "Greet.", acceptableAnswers = listOf("Bonjour.", "Salut"), explanation = t)),
        )
        val l = "The audio says \"Le dessus est propre.\" Sounds."
        assertEquals(
            listOf("Le dessus est propre."),
            spans(Question.Listening(id = "q", prompt = "p", audioText = "Le dessus est propre.", choices = listOf("a", "b"), answer = "Le dessus est propre.", explanation = l)),
        )
        val s = "Target phrase: \"À demain !\" Phrases."
        assertEquals(listOf("À demain !"), spans(Question.Speak(id = "q", prompt = "Say this aloud:", answer = "À demain !", explanation = s)))
    }

    @Test
    fun `ignores the same letters inside an English word and unquoted occurrences`() {
        val prompt = "How do you say \"yes\" in Spanish? ___"
        assertEquals(listOf("sí"), spans(fill(prompt, "sí", "yes → sí. This is a sign, not a dessert.")))
        assertEquals(emptyList<String>(), spans(fill(prompt, "sí", "Say it with a sí in your voice.")))
        assertEquals(emptyList<String>(), spans(fill("How do you say \"no\" in Spanish? ___", "no", "no → nope. Sentences.")))
    }

    @Test
    fun `split marks only the course language pieces`() {
        assertEquals(
            listOf(
                CourseLanguageSpans.Piece("hello → ", false),
                CourseLanguageSpans.Piece("Salut", true),
                CourseLanguageSpans.Piece(". Core greetings.", false),
            ),
            CourseLanguageSpans.split("hello → Salut. Core greetings.", listOf("Salut")),
        )
    }

    /**
     * The web implementation's exact spans and positions for every French and Spanish question
     * (src/lib/save-word-spans.fixtures.json, a byte-for-byte copy guarded by src/lib/save-word-spans-fixture.test.ts).
     * Every question must give the same spans, in the same places; a question absent from the fixture must give none.
     */
    @Test
    fun `the real curriculum matches the web fixture exactly`() {
        val root = Json.parseToJsonElement(resource("save-word-spans.fixtures.json")).jsonObject
        val store = ContentStore(::resource)
        for ((code, course) in listOf("fr" to Course.FRENCH, "es" to Course.SPANISH)) {
            val expected = root.getValue(code).jsonObject
            var seen = 0
            for (unit in store.bundle(course).units) for (lesson in unit.lessons) for (q in lesson.questions) {
                val key = "${lesson.id}:${q.id}"
                val spans = CourseLanguageSpans.spans(q, q.explanation)
                val entry = expected[key]?.jsonObject
                val want = entry?.getValue("spans")?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList()
                assertEquals(want, spans, "$code $key")
                if (entry == null) continue
                seen += 1
                val pieces = CourseLanguageSpans.split(q.explanation, spans)
                val wantPieces = entry.getValue("pieces").jsonArray.map { it as JsonArray }
                assertEquals(wantPieces.map { it[0].jsonPrimitive.content }, pieces.map { it.text }, "$code $key")
                assertEquals(wantPieces.map { it[1].jsonPrimitive.content.toInt() }, pieces.map { if (it.isCourseLanguage) 1 else 0 }, "$code $key")
            }
            assertEquals(expected.size, seen, code)
            assertTrue(seen > 100, "$code has real spans")
        }
    }

    /** Positions, not just strings: the word before an arrow is the English side and is never tappable. */
    @Test
    fun `text before an arrow is never tappable`() {
        for (piece in CourseLanguageSpans.split("hello (informal) → Salut. Core greetings.", listOf("Salut")).filter { it.isCourseLanguage }) {
            assertFalse(piece.text.contains("→"))
            assertEquals("Salut", piece.text)
        }
    }

    // ---- What a lesson offers for saving: the four rules ----

    private val frenchFill = fill("How do you say \"hello\" in French? ___", "Salut", "hello (informal) → Salut. Core greetings.")

    @Test
    fun `scope - spans come only from course language strings`() {
        val scope = SavedWordPolicy.scope(frenchFill, frenchFill.explanation, "fr")
        assertEquals(SavedWordPolicy.Scope.Spans(listOf("Salut")), scope)
    }

    @Test
    fun `scope - no spans in a course that is not English means nothing is tappable`() {
        val idiom = fill("The idiom \"tomber dans les pommes\" means… ___", "to faint", "tomber → \"to faint\". Idioms.")
        assertEquals(SavedWordPolicy.Scope.None, SavedWordPolicy.scope(idiom, idiom.explanation, "fr"))
        assertEquals(SavedWordPolicy.Scope.None, SavedWordPolicy.scope(idiom, idiom.explanation, "es"))
        assertEquals(SavedWordPolicy.Scope.None, SavedWordPolicy.scope(idiom, idiom.explanation, "de"))
    }

    @Test
    fun `scope - English behaviour is unchanged, every word`() {
        val q = fill("Fill the blank: I ___ a student.", "am", "We say \"I am\" for yourself.")
        assertEquals(SavedWordPolicy.Scope.WholeText, SavedWordPolicy.scope(q, q.explanation, "en"))
        assertTrue(SavedWordPolicy.savesWholeText("en"))
        assertFalse(SavedWordPolicy.savesWholeText("fr"))
        assertFalse(SavedWordPolicy.savesWholeText("es"))
    }

    @Test
    fun `tapping a French span saves under fr with the span as the sentence`() {
        val parts = SaveWordParts.of(frenchFill.explanation, "fr", listOf("Salut"))
        val words = parts.filterIsInstance<SaveWordPart.Word>()
        assertEquals(listOf("Salut"), words.map { it.text })
        assertEquals(SaveWordRequest("Salut", "Salut", "fr"), words.single().request)
        // The English words around the span stay plain.
        assertEquals(frenchFill.explanation, parts.joinToString("") { it.text })
        assertTrue(parts.filter { it !is SaveWordPart.Word }.all { it is SaveWordPart.Plain })
    }

    @Test
    fun `a multi-word span saves the span itself as the sentence for each of its words`() {
        val e = "goodbye → Au revoir. Greetings."
        val words = SaveWordParts.of(e, "fr", listOf("Au revoir")).filterIsInstance<SaveWordPart.Word>()
        assertEquals(listOf("Au", "revoir"), words.map { it.text })
        assertEquals(listOf("Au revoir", "Au revoir"), words.map { it.request.sentence })
        assertEquals(listOf("fr", "fr"), words.map { it.request.course })
    }

    @Test
    fun `English text without spans links every word with its own sentence`() {
        val words = SaveWordParts.of("I am here. You are there.", "en", null).filterIsInstance<SaveWordPart.Word>()
        assertEquals(listOf("I", "am", "here", "You", "are", "there"), words.map { it.text })
        assertEquals("You are there.", words.last().request.sentence)
    }
}
