package com.obsidianmedia.learnwithalphonso.core.sound

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SoundEffectsTest {
    private fun gate(
        on: () -> Boolean = { true },
        voice: () -> Boolean = { false },
        now: () -> Long = { 0L },
    ) = SoundEffectGate(isEnabled = on, isVoiceActive = voice, nowMs = now)

    @Test
    fun `each effect has its own raw resource`() {
        val expected = mapOf(
            SoundEffect.RIGHT to "sfx_right",
            SoundEffect.WRONG to "sfx_wrong",
            SoundEffect.LESSON_COMPLETE to "sfx_lesson_complete",
            SoundEffect.XP to "sfx_xp",
            SoundEffect.HEART_LOST to "sfx_heart_lost",
            SoundEffect.TAP to "sfx_tap",
            SoundEffect.CALL_START to "sfx_call_start",
            SoundEffect.CALL_END to "sfx_call_end",
            SoundEffect.ACHIEVEMENT to "sfx_achievement",
        )
        assertEquals(expected.keys, SoundEffect.entries.toSet())
        for (effect in SoundEffect.entries) assertEquals(expected[effect], effect.resourceName, "$effect")
    }

    @Test
    fun `the switch is on by default`() {
        assertTrue(SoundEffectsPreference.DEFAULT)
        assertEquals("soundEffectsEnabled", SoundEffectsPreference.KEY)
    }

    @Test
    fun `switch off plays nothing`() {
        val g = gate(on = { false })
        for (effect in SoundEffect.entries) assertFalse(g.shouldPlay(effect, null), "$effect")
    }

    @Test
    fun `the switch is read at play time`() {
        var on = true
        val g = gate(on = { on })
        assertTrue(g.shouldPlay(SoundEffect.RIGHT, null))
        on = false
        assertFalse(g.shouldPlay(SoundEffect.RIGHT, null))
    }

    @Test
    fun `no effect while the voice is speaking`() {
        var speaking = true
        val g = gate(voice = { speaking })
        assertFalse(g.shouldPlay(SoundEffect.RIGHT, null))
        speaking = false
        assertTrue(g.shouldPlay(SoundEffect.RIGHT, null))
    }

    @Test
    fun `fires once per key`() {
        val g = gate()
        assertTrue(g.shouldPlay(SoundEffect.LESSON_COMPLETE, "finish-1"))
        assertFalse(g.shouldPlay(SoundEffect.LESSON_COMPLETE, "finish-1"))
        assertTrue(g.shouldPlay(SoundEffect.LESSON_COMPLETE, "finish-2"))
        assertTrue(g.shouldPlay(SoundEffect.TAP, null))
        assertTrue(g.shouldPlay(SoundEffect.TAP, null))
    }

    @Test
    fun `a skipped effect does not use up its key`() {
        var speaking = true
        val g = gate(voice = { speaking })
        assertFalse(g.shouldPlay(SoundEffect.RIGHT, "q1"))
        speaking = false
        assertTrue(g.shouldPlay(SoundEffect.RIGHT, "q1"))
    }

    @Test
    fun `call cue remaining so the opening line can wait`() {
        var t = 1000L
        val g = gate(now = { t })
        assertEquals(0L, g.callCueRemainingMs())
        assertTrue(g.shouldPlay(SoundEffect.CALL_START, null))
        t = 1100L
        assertEquals(630L, g.callCueRemainingMs())
        t = 5000L
        assertEquals(0L, g.callCueRemainingMs())
    }

    @Test
    fun `nothing to wait for when the call cue did not play`() {
        val g = gate(on = { false })
        g.shouldPlay(SoundEffect.CALL_START, null)
        assertEquals(0L, g.callCueRemainingMs())
    }

    @Test
    fun `verdict cues`() {
        assertEquals(listOf(SoundEffectCue(SoundEffect.RIGHT, 0)), SoundEffectCues.verdict(correct = true, losesHeart = false))
        assertEquals(listOf(SoundEffectCue(SoundEffect.WRONG, 0)), SoundEffectCues.verdict(correct = false, losesHeart = false))
        assertEquals(
            listOf(SoundEffectCue(SoundEffect.WRONG, 0), SoundEffectCue(SoundEffect.HEART_LOST, SoundEffect.WRONG.durationMs)),
            SoundEffectCues.verdict(correct = false, losesHeart = true),
        )
    }

    @Test
    fun `finish cues`() {
        assertEquals(listOf(SoundEffectCue(SoundEffect.LESSON_COMPLETE, 0)), SoundEffectCues.finish(xp = 0, unlocked = 0))
        assertEquals(
            listOf(
                SoundEffectCue(SoundEffect.LESSON_COMPLETE, 0),
                SoundEffectCue(SoundEffect.XP, 1200),
                SoundEffectCue(SoundEffect.ACHIEVEMENT, 1700),
            ),
            SoundEffectCues.finish(xp = 12, unlocked = 2),
        )
    }

    @Test
    fun haptics() {
        assertEquals(SoundEffectHaptic.SUCCESS, SoundEffect.RIGHT.haptic)
        assertEquals(SoundEffectHaptic.WARNING, SoundEffect.WRONG.haptic)
        assertEquals(SoundEffectHaptic.SUCCESS, SoundEffect.LESSON_COMPLETE.haptic)
        assertEquals(SoundEffectHaptic.SUCCESS, SoundEffect.ACHIEVEMENT.haptic)
        for (e in listOf(SoundEffect.XP, SoundEffect.HEART_LOST, SoundEffect.TAP, SoundEffect.CALL_START, SoundEffect.CALL_END)) {
            assertNull(e.haptic, "$e")
        }
    }
}
