package com.obsidianmedia.learnwithalphonso.core.logic

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SocialLogicTest {
    private fun snap(vararg ids: String) = ids.mapIndexed { i, id -> LeaderboardSnapshotEntry(id, 1000 - i * 10) }

    @Test
    fun `overtake vectors from LeaderboardEngagementTests`() {
        assertTrue(wasOvertaken(previous = snap("me", "bob"), current = snap("bob", "me"), me = "me"))
        assertFalse("I improved", wasOvertaken(snap("bob", "me"), snap("me", "bob"), "me"))
        assertFalse("unchanged", wasOvertaken(snap("ann", "me", "bob"), snap("ann", "me", "bob"), "me"))
        assertFalse("someone above me was already above", wasOvertaken(snap("ann", "me"), snap("ann", "me", "bob"), "me"))
        assertTrue("a newcomer above me who was below me before", wasOvertaken(snap("me", "cat"), snap("cat", "me"), "me"))
        // Review Focus 3: absent from either snapshot is never an overtake.
        assertFalse(wasOvertaken(emptyList(), snap("bob", "me"), "me"))
        assertFalse(wasOvertaken(snap("me", "bob"), snap("bob"), "me"))
        assertFalse("a stranger who was not in the previous snapshot", wasOvertaken(snap("me"), snap("zed", "me"), "me"))
    }

    private fun assertFalse(msg: String, v: Boolean) = assertFalse(v, msg)
    private fun assertTrue(msg: String, v: Boolean) = assertTrue(v, msg)

    @Test
    fun `avatar colour follows the seed's first code point`() {
        // hue for 'a' (97): (97*37) % 360 = 349 -> a warm red.
        val (r, g, b) = avatarRgb("a")
        assertTrue(r > g && r > b)
        val grey = avatarRgb("")
        // code point 0 -> hue 0 -> also red-ish; the two must differ from a mid seed.
        assertTrue(grey.first > grey.second)
        val (r2, _, _) = avatarRgb("m") // 109*37 % 360 = 73 -> yellow-green, red below its green
        val (_, g2, _) = avatarRgb("m")
        assertTrue(g2 > r2)
        assertEquals(avatarRgb("abc"), avatarRgb("axyz"))
    }

    @Test
    fun `monday of the week in UTC`() {
        val wed = 1_790_726_400_000L // 2026-09-30T00:00:00Z, a Wednesday
        assertEquals("2026-09-28", mondayDateString(0, wed))
        assertEquals("2026-09-21", mondayDateString(1, wed))
        val sun = wed + 4 * 86_400_000L // 2026-10-04
        assertEquals("2026-09-28", mondayDateString(0, sun))
        val mon = wed + 5 * 86_400_000L // 2026-10-05
        assertEquals("2026-10-05", mondayDateString(0, mon))
    }

    @Test
    fun `league promotion only upward between known tiers`() {
        assertTrue(isLeaguePromotion("bronze", "silver"))
        assertFalse(isLeaguePromotion("silver", "bronze"))
        assertFalse(isLeaguePromotion("bronze", "bronze"))
        assertFalse(isLeaguePromotion("gold", "diamond"))
    }

    @Test
    fun `nudge cooldown is a full day per friend`() {
        val t = 1_758_000_000_000L
        assertTrue(NudgeCooldown.canNudge(null, t))
        assertFalse(NudgeCooldown.canNudge(t, t + NudgeCooldown.COOLDOWN_MS - 60_000))
        assertTrue(NudgeCooldown.canNudge(t, t + NudgeCooldown.COOLDOWN_MS))
    }
}
