package com.obsidianmedia.learnwithalphonso.core.avatar

import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AvatarCallTest {
    @Test
    fun `every scenario has its own room and everything else gets the default`() {
        assertEquals(12, CallScenes.scenarioIds.size)
        for (id in CallScenes.scenarioIds) assertEquals(CallRoom(id, id, true), CallScenes.room(id), id)
        for (id in listOf("city-day", "free-talk", "", "new-scenario", null)) assertEquals(CallScenes.defaultRoom, CallScenes.room(id), id.toString())
    }

    @Test
    fun `a scenario with art is dimmed not swapped, and the default room has its own evening picture`() {
        assertEquals(CallScenes.defaultRoom, CallScenes.room("doctor", withArt = setOf("coffee")))
        assertNotEquals(CallScenes.defaultRoom.light, CallScenes.defaultRoom.dark)
        assertFalse(CallScenes.defaultRoom.dimInDark)
        assertEquals(0.5, CallScenes.EVENING_OVERLAY_OPACITY)
    }

    @Test
    fun `the caption is the last turn, green when it is the learner's`() {
        val turns = listOf(ChatMessage("assistant", "Hi!"), ChatMessage("user", "A latte"))
        assertEquals(CallCaption("A latte", true), CallCaptionRules.caption(turns, isRecording = false))
        assertEquals(CallCaption("Hi!", false), CallCaptionRules.caption(turns.take(1), isRecording = false))
    }

    @Test
    fun `no caption while the learner holds the button or with nothing said`() {
        assertNull(CallCaptionRules.caption(listOf(ChatMessage("assistant", "Hi!")), isRecording = true))
        assertNull(CallCaptionRules.caption(emptyList(), isRecording = false))
        assertNull(CallCaptionRules.caption(listOf(ChatMessage("assistant", "  ")), isRecording = false))
    }

    @Test
    fun `words light with the audio and all are lit at the end`() {
        assertEquals(0, CallCaptionRules.litWords(10, 0.0))
        assertEquals(6, CallCaptionRules.litWords(10, 0.5))
        assertEquals(10, CallCaptionRules.litWords(10, 1.0))
        assertEquals(10, CallCaptionRules.litWords(10, 4.0))
        assertEquals(0, CallCaptionRules.litWords(0, 0.5))
    }

    @Test
    fun `the clock uses minutes and two digit seconds`() {
        assertEquals("0:00", CallClock.format(0))
        assertEquals("1:05", CallClock.format(65))
        assertEquals("12:30", CallClock.format(750))
        assertEquals("0:00", CallClock.format(-3))
    }

    @Test
    fun `bars rest without metering, stay in bounds, and louder is taller`() {
        for (i in 0 until CallLevel.BAR_COUNT) {
            assertEquals(CallLevel.MIN_HEIGHT, CallLevel.barHeight(null, i))
            assertEquals(CallLevel.MIN_HEIGHT, CallLevel.barHeight(-160.0, i), 0.5)
            for (db in listOf(-60.0, -30.0, 0.0, 12.0)) {
                val h = CallLevel.barHeight(db, i)
                assertTrue(h >= CallLevel.MIN_HEIGHT && h <= CallLevel.MAX_HEIGHT)
            }
            assertTrue(CallLevel.barHeight(-20.0, i) > CallLevel.barHeight(-45.0, i))
        }
    }

    @Test
    fun `an amplitude of zero means no level and full scale is zero dBFS`() {
        assertNull(CallLevel.dBFSFromAmplitude(0))
        assertEquals(0.0, CallLevel.dBFSFromAmplitude(32767)!!, 1e-9)
        assertTrue(CallLevel.dBFSFromAmplitude(3000)!! < -15)
    }

    @Test
    fun `the pill names each mode`() {
        assertEquals(
            listOf("Listening", "Listening to you", "Thinking", "Speaking", "Nice!", "Let's fix that"),
            AvatarMode.entries.map { it.callLabel },
        )
    }

    @Test
    fun `an unknown verdict reads as none`() {
        assertEquals(ReplyVerdict.CORRECT, ReplyVerdict.fromWire("correct"))
        assertEquals(ReplyVerdict.CORRECTED, ReplyVerdict.fromWire("corrected"))
        for (w in listOf("none", "great", "", null)) assertEquals(ReplyVerdict.NONE, ReplyVerdict.fromWire(w))
    }

    @Test
    fun `the call phase keeps the mouth shut until the audio is audible, and goes idle only when the reply is done`() {
        fun phase(req: Boolean = false, rec: Boolean = false, tr: Boolean = false, th: Boolean = false, pend: Boolean = false, play: Boolean = false) =
            CallPhase.of(req, rec, tr, th, pend, play).kind
        assertEquals(PhaseKind.IDLE, phase())
        assertEquals(PhaseKind.REQUESTING_PERMISSION, phase(req = true))
        assertEquals(PhaseKind.RECORDING, phase(rec = true))
        assertEquals(PhaseKind.TRANSCRIBING, phase(tr = true))
        assertEquals(PhaseKind.THINKING, phase(th = true))
        assertEquals(PhaseKind.THINKING, phase(pend = true, play = false))
        assertEquals(PhaseKind.SPEAKING, phase(pend = true, play = true))
        // Pressing talk wins over a reply still playing: an interruption.
        assertEquals(PhaseKind.RECORDING, phase(rec = true, pend = true, play = true))
    }
}
