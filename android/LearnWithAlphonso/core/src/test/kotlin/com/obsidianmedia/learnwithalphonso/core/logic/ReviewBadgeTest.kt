package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ReviewBadgeTest {
    @Test
    fun `no badge at zero, a number below one hundred, a cap above`() {
        assertNull(ReviewBadge.text(0))
        assertNull(ReviewBadge.text(-1))
        assertEquals("7", ReviewBadge.text(7))
        assertEquals("99", ReviewBadge.text(99))
        assertEquals("99+", ReviewBadge.text(150))
    }
}
