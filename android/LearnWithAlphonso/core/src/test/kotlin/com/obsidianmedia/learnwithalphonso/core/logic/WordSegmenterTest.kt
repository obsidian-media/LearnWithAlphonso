package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The cases of src/lib/word-segmenter.test.ts, so the three platforms tap and save the same way. */
class WordSegmenterTest {
    private fun words(text: String) = WordSegmenter.segments(text).filter { it.isWord }.map { it.text }

    private fun sentenceOf(text: String, word: String, nth: Int = 0): String {
        val seg = WordSegmenter.segments(text).filter { it.isWord && it.text == word }[nth]
        return WordSegmenter.requestFor(text, seg, "en").sentence
    }

    @Test
    fun `splits words from the text between them and keeps every character`() {
        val text = "Hello, world! It's fine."
        val segments = WordSegmenter.segments(text)
        assertEquals(text, segments.joinToString("") { it.text })
        assertEquals(listOf("Hello", "world", "It's", "fine"), words(text))
    }

    @Test
    fun `keeps an apostrophe or hyphen only between letters`() {
        assertEquals(listOf("well-known", "quoted", "dogs"), words("well-known 'quoted' dogs'"))
        assertEquals(listOf("don’t"), words("don’t"))
    }

    @Test
    fun `treats digits and symbols as non-words`() {
        assertEquals(listOf("room", "costs"), words("room 42 costs $5"))
    }

    @Test
    fun `reports each segment's start offset in the normalised text`() {
        assertEquals(listOf("ab" to 0, " " to 2, "cd" to 3), WordSegmenter.segments("ab cd").map { it.text to it.start })
    }

    @Test
    fun `composes a decomposed accent so the word is not split in two`() {
        assertEquals(listOf("café", "au", "lait"), words("café au lait"))
    }

    @Test
    fun `returns nothing for empty text`() {
        assertEquals(emptyList<TextSegment>(), WordSegmenter.segments(""))
    }

    @Test
    fun `accepts 1 to 40 UTF-16 units and rejects longer words`() {
        assertTrue(WordSegmenter.isSavable("a"))
        assertTrue(WordSegmenter.isSavable("a".repeat(40)))
        assertFalse(WordSegmenter.isSavable("a".repeat(41)))
        assertFalse(WordSegmenter.isSavable(""))
        assertTrue(WordSegmenter.isSavable("é".repeat(40)), "40 decomposed accents compose to 40 units")
    }

    private val text = "I like tea. She said the answer, and left. He ran home."

    @Test
    fun `picks the sentence that was tapped, not the first one with the word`() {
        val he = WordSegmenter.segments(text).first { it.isWord && it.text == "He" }
        val req = WordSegmenter.requestFor(text, he, "en")
        assertEquals("He ran home.", req.sentence)
        assertEquals("He", req.word)
        assertEquals("en", req.course)
    }

    @Test
    fun `does not match a word inside a longer word`() {
        val t = "The other one. he is here."
        val he = WordSegmenter.segments(t).first { it.isWord && it.text == "he" }
        assertEquals("he is here.", WordSegmenter.requestFor(t, he, "en").sentence)
    }

    @Test
    fun `keeps the same word in two sentences apart`() {
        val t = "Tea is hot. I want Tea."
        assertEquals("Tea is hot.", sentenceOf(t, "Tea", 0))
        assertEquals("I want Tea.", sentenceOf(t, "Tea", 1))
    }

    @Test
    fun `windows an over-long sentence around the TAPPED occurrence within 300 units`() {
        val filler = "word ".repeat(120)
        val t = "${filler}target $filler"
        val target = WordSegmenter.segments(t).first { it.isWord && it.text == "target" }
        val req = WordSegmenter.requestFor(t, target, "en")
        assertTrue(req.sentence.length <= 300)
        assertTrue(req.sentence.contains("target"))
    }

    @Test
    fun `anchors the window on the tapped occurrence when the word repeats`() {
        val filler = "word ".repeat(120)
        val t = "target ${filler}target $filler"
        val second = WordSegmenter.segments(t).filter { it.isWord && it.text == "target" }[1]
        val req = WordSegmenter.requestFor(t, second, "en")
        assertTrue(req.sentence.length <= 300)
        assertEquals(1, Regex("target").findAll(req.sentence).count(), "the first occurrence is out of the window")
        assertTrue(req.sentence.indexOf("target") > 100, "real context before the tapped word")
        assertTrue(req.sentence.length - req.sentence.indexOf("target") > 100, "and after it")
    }

    @Test
    fun `never cuts a surrogate pair at the edge of the window`() {
        val filler = "😀 ".repeat(200)
        for (lead in 0 until 6) {
            val t = "$filler${"x".repeat(lead)} target $filler"
            val target = WordSegmenter.segments(t).first { it.isWord && it.text == "target" }
            val req = WordSegmenter.requestFor(t, target, "en")
            assertTrue(req.sentence.length <= 300, "lead $lead")
            val s = req.sentence
            for (i in s.indices) {
                if (Character.isHighSurrogate(s[i])) assertTrue(i + 1 < s.length && Character.isLowSurrogate(s[i + 1]), "lone high surrogate, lead $lead")
                if (Character.isLowSurrogate(s[i])) assertTrue(i > 0 && Character.isHighSurrogate(s[i - 1]), "lone low surrogate, lead $lead")
            }
        }
    }

    @Test
    fun `builds a request the server's own validator accepts`() {
        val samples = listOf(
            "It's a well-known fact. Don’t panic!",
            "Café au lait is nice… really.\nNext line here.",
            "${"word ".repeat(120)}target ${"word ".repeat(120)}",
        )
        for (t in samples) {
            for (seg in WordSegmenter.segments(t).filter { it.isWord && WordSegmenter.isSavable(it.text) }) {
                val req = WordSegmenter.requestFor(t, seg, "en")
                assertNotNull(SavedWordRules.validated(req), "${seg.text} in ${t.take(30)}")
            }
        }
    }

    @Test
    fun `does not end a sentence at a title abbreviation`() {
        assertEquals("Mr. Smith went home.", sentenceOf("Mr. Smith went home.", "Smith"))
        assertEquals("I met Dr. Jones today.", sentenceOf("I met Dr. Jones today.", "Jones"))
    }

    @Test
    fun `does not end a sentence inside e g, i e or etc`() {
        assertEquals("Bring fruit, e.g. apples, please.", sentenceOf("Bring fruit, e.g. apples, please.", "apples"))
        assertEquals("Bring tea, milk, etc. and sugar.", sentenceOf("Bring tea, milk, etc. and sugar.", "sugar"))
    }

    @Test
    fun `does not end a sentence inside a decimal number or an initial`() {
        assertEquals("Pi is 3.14 roughly.", sentenceOf("Pi is 3.14 roughly.", "roughly"))
        assertEquals("J. Smith left.", sentenceOf("J. Smith left.", "Smith"))
    }

    @Test
    fun `still ends a sentence at an ordinary full stop, including after I`() {
        assertEquals("She likes milk.", sentenceOf("I like tea. She likes milk.", "milk"))
        assertEquals("Next one here.", sentenceOf("So do I. Next one here.", "Next"))
    }
}
