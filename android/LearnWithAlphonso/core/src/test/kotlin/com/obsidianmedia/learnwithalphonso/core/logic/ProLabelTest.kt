package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ProLabelTest {
    @Test
    fun `promotional store reads as Pro (gift)`() {
        assertEquals("Pro (gift)", ProLabel.of(isPro = true, isGift = true))
    }

    @Test
    fun `a purchase reads as plain Pro and free shows nothing`() {
        assertEquals("Pro", ProLabel.of(isPro = true, isGift = false))
        assertNull(ProLabel.of(isPro = false, isGift = false))
    }

    @Test
    fun `a gift flag without active Pro is ignored`() {
        assertNull(ProLabel.of(isPro = false, isGift = true))
    }

    @Test
    fun `only the promotional store is a gift`() {
        assertTrue(ProLabel.isGiftStore("promotional"))
        assertTrue(ProLabel.isGiftStore("PROMOTIONAL"))
        assertFalse(ProLabel.isGiftStore("play_store"))
        assertFalse(ProLabel.isGiftStore("app_store"))
        assertFalse(ProLabel.isGiftStore(null))
    }
}
