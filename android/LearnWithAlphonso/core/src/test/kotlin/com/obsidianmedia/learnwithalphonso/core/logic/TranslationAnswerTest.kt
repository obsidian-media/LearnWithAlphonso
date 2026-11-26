package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.logic.TranslationAnswer.matches
import com.obsidianmedia.learnwithalphonso.core.logic.TranslationAnswer.normalise
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Vectors copied one-to-one from src/lib/translation-answer.test.ts. */
class TranslationAnswerTest {
    private val accepted = listOf("I don't understand.", "I do not understand.", "Sorry, I don't understand.")

    @Test
    fun `accepts any curated phrasing regardless of case and end punctuation`() {
        assertTrue(matches("i dont understand", accepted))
        assertTrue(matches("I DO NOT UNDERSTAND!", accepted))
        assertTrue(matches("sorry, I don't understand", accepted))
    }

    @Test
    fun `answers the contraction question the same way spoken answers do`() {
        assertEquals(normalise("I do not understand"), normalise("I don't understand"))
        assertEquals(normalise("We are meeting at the cafe"), normalise("we are meeting at the café"))
    }

    @Test
    fun `rejects a different sentence and a partial one`() {
        assertFalse(matches("I understand", accepted))
        assertFalse(matches("I do not", accepted))
    }

    @Test
    fun `treats an empty submission as no answer`() {
        assertFalse(matches("", accepted))
        assertFalse(matches("   ", accepted))
    }

    @Test
    fun `written Spanish keeps the enye but other accents still fold`() {
        val ano = listOf("Tengo un año.")
        assertFalse(matches("tengo un ano", ano))
        assertTrue(matches("TENGO UN AÑO", ano))
        assertTrue(matches("Tengo un año.", ano))
        assertTrue(matches("donde esta el niño", listOf("¿Dónde está el niño?")))
        assertEquals("el niño", normalise("¡El Niño!"))
        assertEquals("ano", SpokenAnswer.normalise("año")) // speech keeps its tolerance
    }

    @Test
    fun `fails closed on an empty acceptable list`() {
        assertFalse(matches("anything at all", emptyList()))
    }
}
