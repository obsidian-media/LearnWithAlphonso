package com.obsidianmedia.learnwithalphonso.ui.word

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Which words are tappable is an explicit [com.obsidianmedia.learnwithalphonso.core.logic.SaveWordMode] at every
 * `TappableText` call site (no default), so no caller can fall into a wrong behaviour by omission. The Compose views are
 * not run on the JVM, so these read the Kotlin source (the Android twin of src/lib/ios-save-word-guards.test.ts):
 * Hector, Practice and transcripts keep every word, as before French and Spanish lesson spans existed; lesson cards take
 * their mode from the policy and link nothing in a French or Spanish course that has no spans.
 */
class SaveWordSourceGuardsTest {
    private val root = File("src/main/java/com/obsidianmedia/learnwithalphonso/ui")

    private fun read(path: String) = File(root, path).readText().replace("\r\n", "\n")

    private fun callers(): Map<String, List<String>> {
        val out = sortedMapOf<String, List<String>>()
        root.walkTopDown().filter { it.isFile && it.extension == "kt" }.forEach { f ->
            val src = f.readText().replace("\r\n", "\n")
            val modes = Regex("""TappableText\(([^\n]*)""").findAll(src)
                .filter { it.groupValues[1].isNotBlank() } // the declaration's own line ends at "("
                .map { m ->
                    // The first three arguments are text, course, mode.
                    val args = m.groupValues[1].split(",").map { it.trim() }
                    args.getOrNull(2) ?: "MISSING"
                }.toList()
            if (modes.isNotEmpty()) out[f.relativeTo(root).path.replace('\\', '/')] = modes
        }
        return out
    }

    @Test
    fun `every TappableText caller is pinned to its mode`() {
        assertEquals(
            mapOf(
                "components/AlphonsoComponents.kt" to listOf("saveMode", "saveMode"),
                "hector/HectorScreen.kt" to listOf("SaveWordMode.AllWords"),
                "listen/ListenScreen.kt" to listOf("SaveWordMode.AllWords"),
                "practice/PracticeScreens.kt" to listOf("SaveWordMode.AllWords"),
            ),
            callers(),
        )
    }

    @Test
    fun `TappableText takes a required mode with no default`() {
        val src = read("word/SaveWord.kt")
        assertTrue(Regex("""\n {4}mode: SaveWordMode,\n""").containsMatchIn(src))
        assertFalse(Regex("""mode: SaveWordMode\s*=""").containsMatchIn(src))
        assertFalse(src.contains("courseSpans"))
    }

    @Test
    fun `the lesson cards link nothing unless a mode says so`() {
        val src = read("components/AlphonsoComponents.kt")
        // A card or caption without a mode is plain text (the default is Plain), and Plain never reaches TappableText.
        assertEquals(2, Regex("""saveMode: SaveWordMode = SaveWordMode\.Plain""").findAll(src).count())
        assertEquals(2, Regex("""saveMode != SaveWordMode\.Plain""").findAll(src).count())
    }

    @Test
    fun `a lesson explanation takes its mode from the policy, and generated practice is English-only`() {
        val card = read("lesson/QuestionCard.kt")
        assertTrue(card.contains("SavedWordPolicy.scope(question, explanation, course.code)"))
        assertTrue(card.contains("SavedWordPolicy.savesWholeText(course.code)"))
        assertTrue(card.contains("val saveCourse = course.code.takeIf { mode != SaveWordMode.Plain }"))
        // Generated practice passes no question, so it can only ever be English-only.
        assertTrue(read("lesson/GeneratedPractice.kt").contains("Explanation(container, state.picked == correct, q.explanation, course)"))
    }
}
