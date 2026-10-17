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

    @Test
    fun `the offline gate blocks only at 0 hearts with no due refill`() {
        assertEquals(HeartsEconomy.GateDecision.Open, HeartsEconomy.gate(1, null, now))
        assertEquals(HeartsEconomy.GateDecision.OutOfHearts(now + 60_000), HeartsEconomy.gate(0, now + 60_000, now))
        assertEquals(HeartsEconomy.GateDecision.OutOfHearts(null), HeartsEconomy.gate(0, null, now))
        // A refill that is due resolves first, as the server does.
        assertEquals(HeartsEconomy.GateDecision.Open, HeartsEconomy.gate(0, now, now))
    }

    @Test
    fun `losing the last heart starts the refill timer once`() {
        assertEquals(HeartsState(2, null), HeartsEconomy.afterLosingHeart(3, null, now))
        assertEquals(HeartsState(0, now + HeartsEconomy.HEART_REFILL_MS), HeartsEconomy.afterLosingHeart(1, null, now))
        assertEquals(HeartsState(0, now + 5), HeartsEconomy.afterLosingHeart(1, now + 5, now))
        assertEquals(HeartsState(0, now + 5), HeartsEconomy.afterLosingHeart(0, now + 5, now))
    }

    @Test
    fun `out-of-hearts countdown and copy match iOS and web`() {
        val model = OutOfHeartsModel(now + 90_500)
        assertEquals("1:31", model.countdown(now))
        assertEquals("You've used all your hearts for now. They refill automatically in 1:31.", model.message(now))
        assertEquals("0:01", model.countdown(now + 90_000))
        assertEquals(null, model.countdown(now + 90_500))
        assertEquals("You've used all your hearts for now. They'll refill again shortly.", model.message(now + 90_500))
        assertFalse(model.isRefillDue(now))
        assertTrue(model.isRefillDue(now + 90_500))
        assertFalse(OutOfHeartsModel(null).isRefillDue(now))
        assertEquals("Use 50 XP for a heart", OutOfHeartsModel.BUY_TITLE)
        assertTrue(model.showsBuy(isOnline = true))
        assertFalse(model.showsBuy(isOnline = false))
    }
}
