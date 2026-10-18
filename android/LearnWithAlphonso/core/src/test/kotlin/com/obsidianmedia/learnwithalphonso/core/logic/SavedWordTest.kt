package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SavedWordTest {
    @Test
    fun `each server status maps to its own error, and a consent refusal is not a sign-in problem`() {
        val cases = listOf(
            400 to SavedWordError.INVALID, 401 to SavedWordError.NOT_SIGNED_IN, 403 to SavedWordError.NOT_SIGNED_IN,
            409 to SavedWordError.LIMIT_REACHED, 429 to SavedWordError.QUOTA_EXCEEDED, 502 to SavedWordError.UNAVAILABLE,
            500 to SavedWordError.UNAVAILABLE,
        )
        for ((status, expected) in cases) assertEquals(expected, SavedWordError.from(status), "status $status")
        assertEquals(SavedWordError.AI_CONSENT_REQUIRED, SavedWordError.from(403, "ai-consent-required"))
        assertEquals(SavedWordError.NOT_SIGNED_IN, SavedWordError.from(403, null))
        assertEquals(SavedWordError.UNAVAILABLE, SavedWordError.from(503, "consent-check-failed"))
        assertFalse(SavedWordError.AI_CONSENT_REQUIRED.userMessage.contains("Sign in"))
    }

    @Test
    fun `the learner copy is the iOS wording and only unavailable or offline offer Try again`() {
        assertEquals("You've reached the limit of 500 saved words. Finish some reviews first.", SavedWordError.LIMIT_REACHED.userMessage)
        assertEquals("Saving a word needs a connection.", SavedWordError.OFFLINE.userMessage)
        assertEquals(setOf(SavedWordError.UNAVAILABLE, SavedWordError.OFFLINE), SavedWordError.entries.filter { it.isRetryable }.toSet())
    }

    @Test
    fun `only the English course offers saving in lesson text`() {
        assertTrue(SavedWordPolicy.allowsSaving("en"))
        assertFalse(SavedWordPolicy.allowsSaving("fr"))
        assertFalse(SavedWordPolicy.allowsSaving("es"))
        assertFalse(SavedWordPolicy.allowsSaving(""))
    }

    @Test
    fun `the lesson hint is shown the first three times only`() {
        assertTrue(SavedWordHint.shouldShow(0))
        assertTrue(SavedWordHint.shouldShow(2))
        assertFalse(SavedWordHint.shouldShow(3))
        assertFalse(SavedWordHint.shouldShow(10))
    }

    private fun check(word: String, sentence: String, course: String = "en") = SavedWordRules.validated(SaveWordRequest(word, sentence, course))

    @Test
    fun `a request the server would refuse is refused before any network call`() {
        assertNotNull(check("tea", "I like tea."))
        assertNull(check("tea", "I like coffee."), "the sentence must contain the word")
        assertNull(check("he", "The other one."), "a whole word, not a substring")
        assertNull(check("two words", "two words here"), "one word at a time")
        assertNull(check("42", "room 42"), "digits are not words")
        assertNull(check("a".repeat(41), "a".repeat(41)), "word too long")
        assertNull(check("tea", "tea ".repeat(100)), "sentence too long")
        assertNull(check("tea", "I like tea.", course = "de"), "unknown course")
        assertNull(check("", "I like tea."))
    }

    @Test
    fun `the request is normalised the way the server stores it`() {
        assertEquals("café", check(" café ", "Un café chaud.", course = "fr")?.word)
        assertNotNull(check("don’t", "I don't know."), "a typographic apostrophe equals a straight one")
        assertNotNull(check("Tea", "i like tea"), "case is ignored")
    }
}
