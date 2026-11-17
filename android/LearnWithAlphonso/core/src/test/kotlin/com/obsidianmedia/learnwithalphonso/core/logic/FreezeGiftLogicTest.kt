package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test

class FreezeGiftLogicTest {
    @Test
    fun `a known database reason maps to itself and anything else to a plain error`() {
        assertEquals(GiftFreezeReason.RECIPIENT_FULL, FreezeGiftLogic.reason("recipient-full"))
        assertEquals(GiftFreezeReason.ALREADY_GIFTED_TODAY, FreezeGiftLogic.reason("already-gifted-today"))
        assertEquals(GiftFreezeReason.NO_FREEZE, FreezeGiftLogic.reason("no-freeze"))
        assertEquals(GiftFreezeReason.NOT_FRIENDS, FreezeGiftLogic.reason("not-friends"))
        assertEquals(GiftFreezeReason.UNAUTHENTICATED, FreezeGiftLogic.reason("unauthenticated"))
        assertEquals(GiftFreezeReason.ERROR, FreezeGiftLogic.reason("made-up"))
        assertEquals(GiftFreezeReason.ERROR, FreezeGiftLogic.reason(null))
        assertEquals(GiftFreezeReason.ERROR, FreezeGiftLogic.reason("error"))
    }

    @Test
    fun `each result reads as its own sentence, the same as the web`() {
        fun msg(reason: GiftFreezeReason?, ok: Boolean = false) = FreezeGiftLogic.message(GiftFreezeOutcome(ok, reason, null), "Bo")
        assertEquals("Freeze sent to Bo.", msg(null, ok = true))
        assertEquals("Bo already has all the freezes they can hold.", msg(GiftFreezeReason.RECIPIENT_FULL))
        assertEquals("You already gifted Bo a freeze today. Try again tomorrow.", msg(GiftFreezeReason.ALREADY_GIFTED_TODAY))
        assertEquals("You have no streak freeze to give.", msg(GiftFreezeReason.NO_FREEZE))
        assertEquals("Couldn't send a freeze to Bo.", msg(GiftFreezeReason.NOT_FRIENDS))
        assertEquals("Couldn't send a freeze to Bo. Try again.", msg(GiftFreezeReason.ERROR))
        assertEquals("Couldn't send a freeze to Bo. Try again.", msg(GiftFreezeReason.UNAUTHENTICATED))
    }

    @Test
    fun `the button is offered only when a freeze is held and the friend was not gifted today`() {
        val today = setOf("u2")
        assertEquals(GiftButtonState.SEND, FreezeGiftLogic.buttonState(1, emptySet(), "u2"))
        assertEquals(GiftButtonState.SEND, FreezeGiftLogic.buttonState(3, today, "u3"))
        assertEquals(GiftButtonState.SENT_TODAY, FreezeGiftLogic.buttonState(2, today, "u2"))
        assertEquals(GiftButtonState.NO_FREEZE, FreezeGiftLogic.buttonState(0, emptySet(), "u2"))
        // Already gifted wins over no freeze: the row says why it is off, in the more specific way.
        assertEquals(GiftButtonState.SENT_TODAY, FreezeGiftLogic.buttonState(0, today, "u2"))
        // An unknown balance offers the button; the database answers.
        assertEquals(GiftButtonState.SEND, FreezeGiftLogic.buttonState(null, emptySet(), "u2"))
    }

    @Test
    fun `the accessible name says what the button does or why it is off`() {
        val labels = GiftButtonState.entries.map { FreezeGiftLogic.accessibilityLabel("Bo", it) }
        assertEquals(3, labels.toSet().size)
        assertEquals("Gift a streak freeze to Bo", FreezeGiftLogic.accessibilityLabel("Bo", GiftButtonState.SEND))
        assertEquals("Streak freeze already sent to Bo today", FreezeGiftLogic.accessibilityLabel("Bo", GiftButtonState.SENT_TODAY))
        assertNotEquals(
            FreezeGiftLogic.accessibilityLabel("Bo", GiftButtonState.SEND),
            FreezeGiftLogic.accessibilityLabel("Bo", GiftButtonState.NO_FREEZE),
        )
    }

    @Test
    fun `received freezes toast one friend by name and several by count`() {
        assertEquals("Bo gifted you a streak freeze!", FreezeGiftLogic.receivedToast(listOf("Bo")))
        assertEquals("2 friends gifted you a streak freeze!", FreezeGiftLogic.receivedToast(listOf("Bo", "Cy")))
    }
}
