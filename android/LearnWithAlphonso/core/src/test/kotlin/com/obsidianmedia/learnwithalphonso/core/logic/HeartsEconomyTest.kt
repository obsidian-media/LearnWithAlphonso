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

    private val step = HeartsEconomy.HEART_REFILL_MS

    @Test
    fun `full hearts have no timer`() {
        assertEquals(HeartsState(5, null), HeartsEconomy.resolveHeartsRefill(5, now + 5, now))
    }

    @Test
    fun `before the timestamp leaves hearts alone`() {
        assertEquals(HeartsState(2, now + 1000), HeartsEconomy.resolveHeartsRefill(2, now + 1000, now))
    }

    @Test
    fun `one heart per due interval, also exactly at the timestamp`() {
        assertEquals(HeartsState(3, now - 1 + step), HeartsEconomy.resolveHeartsRefill(2, now - 1, now))
        assertEquals(HeartsState(1, now + step), HeartsEconomy.resolveHeartsRefill(0, now, now))
    }

    @Test
    fun `two hours away gives four hearts`() {
        val due = now - 4 * step + 1000
        assertEquals(HeartsState(4, due + 4 * step), HeartsEconomy.resolveHeartsRefill(0, due, now))
    }

    @Test
    fun `the leftover time carries into the next heart`() {
        assertEquals(HeartsState(3, now + step / 2), HeartsEconomy.resolveHeartsRefill(1, now - step - step / 2, now))
    }

    @Test
    fun `caps at max and clears the timer`() {
        assertEquals(HeartsState(5, null), HeartsEconomy.resolveHeartsRefill(3, now - 10 * step, now))
    }

    @Test
    fun `a row below the cap with no timer starts the clock`() {
        assertEquals(HeartsState(3, now + step), HeartsEconomy.resolveHeartsRefill(3, null, now))
    }

    @Test
    fun `gain keeps a running clock below the cap and clears it at the cap`() {
        assertEquals(HeartsState(3, now + 900), HeartsEconomy.gainHearts(2, 1, now + 900, now))
        assertEquals(HeartsState(5, null), HeartsEconomy.gainHearts(4, 3, now + 900, now))
        assertEquals(HeartsState(1, now + step), HeartsEconomy.gainHearts(0, 1, null, now))
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
        assertEquals(HeartsEconomy.GateDecision.OutOfHearts(now + step), HeartsEconomy.gate(0, null, now))
        // A refill that is due resolves first, as the server does.
        assertEquals(HeartsEconomy.GateDecision.Open, HeartsEconomy.gate(0, now, now))
    }

    @Test
    fun `Pro is never out of hearts and its wrong answers cost nothing`() {
        assertEquals(HeartsEconomy.GateDecision.Open, HeartsEconomy.gate(0, now + 60_000, now, unlimited = true))
        assertEquals(HeartsEconomy.GateDecision.OutOfHearts(now + 60_000), HeartsEconomy.gate(0, now + 60_000, now, unlimited = false))
        assertEquals(true, HeartsEconomy.wrongAnswerCostsHeart(unlimited = false))
        assertEquals(false, HeartsEconomy.wrongAnswerCostsHeart(unlimited = true))
    }

    @Test
    fun `next heart countdown counts down below the cap and is null otherwise`() {
        assertEquals("1:31", HeartsEconomy.nextHeartCountdown(3, now + 90_500, now))
        assertEquals("0:01", HeartsEconomy.nextHeartCountdown(3, now + 1, now))
        assertEquals(null, HeartsEconomy.nextHeartCountdown(3, now, now))
        assertEquals(null, HeartsEconomy.nextHeartCountdown(5, now + 90_000, now))
        assertEquals(null, HeartsEconomy.nextHeartCountdown(3, null, now))
    }

    @Test
    fun `losing a heart starts a clock from full, keeps a running one and never goes below zero`() {
        assertEquals(HeartsState(4, now + step), HeartsEconomy.afterLosingHeart(5, null, now))
        assertEquals(HeartsState(2, now + 600_000), HeartsEconomy.afterLosingHeart(3, now + 600_000, now))
        assertEquals(HeartsState(2, now - 1 + step), HeartsEconomy.afterLosingHeart(2, now - 1, now))
        assertEquals(HeartsState(0, now + 5), HeartsEconomy.afterLosingHeart(0, now + 5, now))
    }

    @Test
    fun `out-of-hearts countdown and copy match iOS and web`() {
        val model = OutOfHeartsModel(now + 90_500)
        assertEquals("1:31", model.countdown(now))
        assertEquals("You've used all your hearts for now. Your next heart comes back in 1:31.", model.message(now))
        assertEquals("0:01", model.countdown(now + 90_000))
        assertEquals(null, model.countdown(now + 90_500))
        assertEquals("You've used all your hearts for now. A heart will come back shortly.", model.message(now + 90_500))
        assertFalse(model.isRefillDue(now))
        assertTrue(model.isRefillDue(now + 90_500))
        assertFalse(OutOfHeartsModel(null).isRefillDue(now))
        assertEquals("Use 50 XP for a heart", OutOfHeartsModel.BUY_TITLE)
        assertTrue(model.showsBuy(isOnline = true))
        assertFalse(model.showsBuy(isOnline = false))
    }
}
