package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.logic.SpokenAnswer.matches
import com.obsidianmedia.learnwithalphonso.core.logic.SpokenAnswer.normalise
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Vectors copied one-to-one from src/lib/spoken-answer.test.ts. */
class SpokenAnswerTest {
    @Test
    fun `strips punctuation and case`() {
        assertEquals(normalise("shes a doctor"), normalise("She's a Doctor!"))
    }

    @Test
    fun `treats a contraction and its expansion as the same`() {
        assertEquals(normalise("she's a doctor"), normalise("she is a doctor"))
        assertEquals(normalise("I don't understand"), normalise("I do not understand"))
        assertEquals(normalise("we'll see"), normalise("we will see"))
    }

    @Test
    fun `collapses whitespace`() {
        assertEquals(normalise("good morning"), normalise("  good   morning "))
    }

    @Test
    fun `accepts the expected phrase however it was transcribed`() {
        assertTrue(matches("She's a doctor.", "She is a doctor"))
        assertTrue(matches("she is a DOCTOR", "She's a doctor"))
        assertTrue(matches("I don't understand", "I do not understand."))
    }

    @Test
    fun `forgives a leading filler word`() {
        assertTrue(matches("um, she's a doctor", "She's a doctor"))
        assertTrue(matches("uh good morning", "Good morning."))
    }

    @Test
    fun `rejects a different sentence`() {
        assertFalse(matches("he is a driver", "She's a doctor"))
    }

    @Test
    fun `rejects a partial attempt`() {
        assertFalse(matches("she is", "She's a doctor"))
        assertFalse(matches("good", "Good morning."))
    }

    @Test
    fun `treats an empty transcript as no answer, not a wrong one`() {
        assertFalse(matches("", "She's a doctor"))
        assertFalse(matches("   ", "She's a doctor"))
    }

    @Test
    fun `matches a number said as a word against the numeral Deepgram returns`() {
        assertTrue(matches("the bus leaves at 9", "The bus leaves at nine."))
        assertTrue(matches("I have 2 brothers", "I have two brothers."))
        assertTrue(matches("I have two brothers", "I have two brothers."))
    }

    @Test
    fun `still tells two different numbers apart`() {
        assertFalse(matches("I have 3 brothers", "I have two brothers."))
    }

    @Test
    fun `expands let's the same way as its apostrophe-less spelling`() {
        assertTrue(matches("Let's not lose sight of it", "Let us not lose sight of it"))
        assertEquals(normalise("lets"), normalise("let's"))
    }

    @Test
    fun `treats cannot and can't as the same word`() {
        assertTrue(matches("I am afraid I can't agree", "I am afraid I cannot agree"))
    }

    @Test
    fun `expands negated contractions that are not in the apostrophe-less list`() {
        assertTrue(matches("I mustn't forget", "I must not forget"))
        assertTrue(matches("You needn't wait", "You need not wait"))
    }

    @Test
    fun `folds accents rather than deleting them`() {
        assertTrue(matches("we are meeting at the café later", "We are meeting at the cafe later"))
    }

    @Test
    fun `does not silently accept a contracted has as a contracted is`() {
        assertFalse(matches("he's already finished", "He has already finished"))
    }
}
