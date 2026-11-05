package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** Mirrors src/lib/asking-alphonso.test.ts -- keep in sync with that file. */
class AskingAlphonsoLayoutTest {
    private fun size(h: Int, scale: Float = 1f, length: Int = 22, media: Boolean = false) =
        AskingAlphonsoLayout.portraitSizeDp(h, scale, length, media)

    @Test
    fun `steps by screen height`() {
        assertNull(size(640))
        assertEquals(56, size(641))
        assertEquals(56, size(719))
        assertEquals(120, size(720))
        assertEquals(120, size(800))
    }

    @Test
    fun `font scale 1_3 and up drops him, 1_29 does not`() {
        assertNull(size(800, scale = 1.3f))
        assertNull(size(800, scale = 2f))
        assertEquals(120, size(800, scale = 1.29f))
    }

    @Test
    fun `a prompt of exactly 60 characters is not long, 61 is`() {
        assertEquals(120, size(800, length = 60))
        assertEquals(56, size(800, length = 61))
    }

    @Test
    fun `a media card caps him at the small avatar`() {
        assertEquals(56, size(800, media = true))
    }

    @Test
    fun `a long prompt on a media card removes him`() {
        assertNull(size(800, length = 70, media = true))
        assertNull(size(700, length = 70, media = true))
    }

    @Test
    fun `a crowded card never makes him bigger on a short screen`() {
        assertNull(size(600, media = true))
        assertNull(size(640, length = 70))
        assertEquals(56, size(700, length = 70))
    }
}
