package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.logic.HeartsEconomy.HeartsState
import com.obsidianmedia.learnwithalphonso.core.logic.HeartsEconomy.XpPurchaseResult
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Vectors copied from src/lib/hearts.test.ts. */
class HeartsEconomyTest {
    private val now = 1_700_000_000_000L

    @Test
    fun `no refill pending leaves hearts alone`() {
        assertEquals(HeartsState(3, null), HeartsEconomy.resolveHeartsRefill(3, null, now))
    }

    @Test
    fun `before the timestamp leaves hearts alone`() {
        assertEquals(HeartsState(0, now + 1000), HeartsEconomy.resolveHeartsRefill(0, now + 1000, now))
    }

    @Test
    fun `after the timestamp restores to max and clears`() {
        assertEquals(HeartsState(5, null), HeartsEconomy.resolveHeartsRefill(0, now - 1, now))
    }

    @Test
    fun `exactly at the timestamp restores`() {
        assertEquals(HeartsState(5, null), HeartsEconomy.resolveHeartsRefill(0, now, now))
    }

    @Test
    fun `gain adds up to the cap and clears the timer`() {
        assertEquals(HeartsState(4, null), HeartsEconomy.gainHearts(3, 1))
        assertEquals(HeartsState(5, null), HeartsEconomy.gainHearts(4, 3))
        assertEquals(HeartsState(1, null), HeartsEconomy.gainHearts(0, 1))
    }

    @Test
    fun `perfect lesson bonus needs every answer right and at least one question`() {
        assertTrue(HeartsEconomy.perfectLessonBonusEarned(8, 8))
        assertFalse(HeartsEconomy.perfectLessonBonusEarned(7, 8))
        assertFalse(HeartsEconomy.perfectLessonBonusEarned(0, 0))
    }

    @Test
    fun `streak milestone fires only when crossing a multiple of seven`() {
        assertTrue(HeartsEconomy.streakHeartMilestoneReached(6, 7))
        assertFalse(HeartsEconomy.streakHeartMilestoneReached(7, 7))
        assertFalse(HeartsEconomy.streakHeartMilestoneReached(7, 8))
        assertTrue(HeartsEconomy.streakHeartMilestoneReached(13, 14))
        assertTrue(HeartsEconomy.streakHeartMilestoneReached(20, 21))
    }

    @Test
    fun `buy heart with xp`() {
        assertEquals(XpPurchaseResult.Ok(3, 50), HeartsEconomy.buyHeartWithXp(2, 100))
        assertEquals(XpPurchaseResult.HeartsFull, HeartsEconomy.buyHeartWithXp(5, 1000))
        assertEquals(XpPurchaseResult.InsufficientXp, HeartsEconomy.buyHeartWithXp(2, 49))
        assertEquals(XpPurchaseResult.Ok(3, 0), HeartsEconomy.buyHeartWithXp(2, 50))
    }
}
