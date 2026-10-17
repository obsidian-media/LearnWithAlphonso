package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AiConsentPolicyTest {
    @Test
    fun `only the screens that are AI wall the whole screen`() {
        val walled = AiConsentSurface.entries.filter { AiConsentPolicy.blocksWholeScreen(it) }
        assertEquals(setOf(AiConsentSurface.HECTOR, AiConsentSurface.CONVERSATION, AiConsentSurface.CAMPAIGN), walled.toSet())
    }

    @Test
    fun `lesson and review degrade item by item and offer the opt in, placement never uses AI`() {
        assertEquals(AiItemMode.LOCAL_WITH_OPT_IN, AiConsentPolicy.translateMode(AiConsentSurface.LESSON, false))
        assertEquals(AiItemMode.LOCAL_WITH_OPT_IN, AiConsentPolicy.translateMode(AiConsentSurface.REVIEW, false))
        assertEquals(AiItemMode.AI, AiConsentPolicy.translateMode(AiConsentSurface.LESSON, true))
        assertEquals(AiItemMode.LOCAL, AiConsentPolicy.translateMode(AiConsentSurface.PLACEMENT, true))
        assertEquals(AiItemMode.LOCAL, AiConsentPolicy.translateMode(AiConsentSurface.HECTOR, false))
    }

    @Test
    fun `the grading opt in shows only when the account itself said no`() {
        assertTrue(AiConsentPolicy.offersAiGradingOptIn(AiConsentSurface.LESSON, AiConsentStatus.DENIED))
        assertTrue(AiConsentPolicy.offersAiGradingOptIn(AiConsentSurface.REVIEW, AiConsentStatus.DENIED))
        for (status in listOf(AiConsentStatus.LOADING, AiConsentStatus.UNAVAILABLE, AiConsentStatus.GRANTED)) {
            assertFalse(AiConsentPolicy.offersAiGradingOptIn(AiConsentSurface.LESSON, status), "$status")
        }
        assertFalse(AiConsentPolicy.offersAiGradingOptIn(AiConsentSurface.PLACEMENT, AiConsentStatus.DENIED))
    }

    @Test
    fun `a written answer leaves the device only with a connection and consent`() {
        assertTrue(TranslationGradingPolicy.mayAskServer(isConnected = true, hasAccessToken = true, hasAiConsent = true))
        assertFalse(TranslationGradingPolicy.mayAskServer(isConnected = true, hasAccessToken = true, hasAiConsent = false))
        assertFalse(TranslationGradingPolicy.mayAskServer(isConnected = false, hasAccessToken = true, hasAiConsent = true))
        assertFalse(TranslationGradingPolicy.mayAskServer(isConnected = true, hasAccessToken = false, hasAiConsent = true))
    }

    @Test
    fun `the typing fallback says why voice is off`() {
        assertEquals("The microphone isn't available. Type the phrase instead.", AiConsentCopy.speakFallback(true, true, true))
        assertEquals("You're offline, so speech can't be checked. Type the phrase instead.", AiConsentCopy.speakFallback(false, false, false))
        assertEquals(AiConsentCopy.speakFallbackNoConsent, AiConsentCopy.speakFallback(false, true, false))
        assertEquals("Type the phrase instead.", AiConsentCopy.speakFallback(false, true, true))
    }
}

class AiConsentGateTest {
    private fun p(status: AiConsentStatus, shown: Boolean, refreshed: Boolean) = AiConsentGate.presentation(status, shown, refreshed)

    @Test
    fun `a first visit waits for the read and never prompts a learner who may have consented elsewhere`() {
        assertEquals(AiConsentGatePresentation.Spinner, p(AiConsentStatus.LOADING, shown = false, refreshed = false))
        // A remembered "denied" is not trusted until this gate's own read has finished.
        assertEquals(AiConsentGatePresentation.Spinner, p(AiConsentStatus.DENIED, shown = false, refreshed = false))
        assertEquals(AiConsentGatePresentation.Prompt(AiConsentGatePrompt.CONSENT), p(AiConsentStatus.DENIED, shown = false, refreshed = true))
        assertEquals(AiConsentGatePresentation.Prompt(AiConsentGatePrompt.RETRY), p(AiConsentStatus.UNAVAILABLE, shown = false, refreshed = true))
        assertEquals(AiConsentGatePresentation.Content(null), p(AiConsentStatus.GRANTED, shown = false, refreshed = false))
    }

    @Test
    fun `once shown the screen is never unmounted, the prompt only covers it`() {
        assertEquals(AiConsentGatePresentation.Content(null), p(AiConsentStatus.GRANTED, shown = true, refreshed = true))
        assertEquals(AiConsentGatePresentation.Content(null), p(AiConsentStatus.LOADING, shown = true, refreshed = true))
        assertEquals(AiConsentGatePresentation.Content(AiConsentGatePrompt.CONSENT), p(AiConsentStatus.DENIED, shown = true, refreshed = true))
        assertEquals(AiConsentGatePresentation.Content(AiConsentGatePrompt.RETRY), p(AiConsentStatus.UNAVAILABLE, shown = true, refreshed = true))
        for (status in AiConsentStatus.entries) {
            val result = p(status, shown = true, refreshed = false)
            assertTrue(result is AiConsentGatePresentation.Content, "$status must keep the screen mounted")
        }
    }
}
