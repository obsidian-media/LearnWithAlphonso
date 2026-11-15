package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop.Effect
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop.Event
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop.PauseReason
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop.Status
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** HandsFreeLoopTests.swift, test for test: the same numbers, the same sequences, the same expectations. */
class HandsFreeLoopTest {
    private val quiet = -60.0
    private val speech = -20.0

    private fun phase(p: VoicePhase) = Event.Phase(p)

    /** A loop that is on and recording turn 1. */
    private fun recordingLoop(tuning: HandsFreeLoop.Tuning = HandsFreeLoop.Tuning.HECTOR): HandsFreeLoop {
        val loop = HandsFreeLoop(tuning)
        assertEquals(listOf(Effect.BEGIN_TURN), loop.handle(Event.Enable))
        loop.handle(phase(VoicePhase.REQUESTING_PERMISSION))
        assertEquals(emptyList<Effect>(), loop.handle(phase(VoicePhase.RECORDING)))
        assertEquals(Status.Listening, loop.status)
        return loop
    }

    /** Feeds samples every 0.1 s from `from` (inclusive) to `to` (exclusive) and collects the effects. */
    private fun feed(loop: HandsFreeLoop, level: Double, from: Double, to: Double): List<Effect> {
        val effects = ArrayList<Effect>()
        var t = from
        while (t < to - 1e-9) {
            effects += loop.handle(Event.Level(level, t))
            t += 0.1
        }
        return effects
    }

    @Test
    fun `enabling when idle starts listening`() {
        val loop = HandsFreeLoop()
        assertEquals(listOf(Effect.BEGIN_TURN), loop.handle(Event.Enable))
        assertEquals(emptyList<Effect>(), loop.handle(Event.Enable), "enabling twice does nothing")
    }

    @Test
    fun `enabling while the partner is replying waits for the reply to end`() {
        val loop = HandsFreeLoop()
        loop.handle(phase(VoicePhase.SPEAKING))
        assertEquals(emptyList<Effect>(), loop.handle(Event.Enable))
        assertEquals(listOf(Effect.BEGIN_TURN), loop.handle(phase(VoicePhase.IDLE)))
    }

    @Test
    fun `speech then a pause ends the turn once`() {
        val loop = recordingLoop()
        assertEquals(emptyList<Effect>(), feed(loop, quiet, 0.0, 0.5))
        assertEquals(emptyList<Effect>(), feed(loop, speech, 0.5, 2.0))
        assertEquals(Status.Hearing, loop.status)
        // 1.1 s of quiet: not yet.
        assertEquals(emptyList<Effect>(), feed(loop, quiet, 2.0, 3.0))
        val ended = feed(loop, quiet, 3.0, 4.0)
        assertEquals(listOf(Effect.END_TURN), ended, "one end, at 1.2 s of quiet")
    }

    @Test
    fun `a short click is not speech`() {
        val loop = recordingLoop()
        feed(loop, quiet, 0.0, 0.5)
        feed(loop, speech, 0.5, 0.6)
        assertEquals(Status.Listening, loop.status)
        assertEquals(emptyList<Effect>(), feed(loop, quiet, 0.6, 3.0), "a click followed by quiet never ends the turn")
    }

    @Test
    fun `nobody speaking cancels and pauses so the mic never stays open`() {
        val loop = recordingLoop()
        val effects = feed(loop, quiet, 0.0, 8.2)
        assertEquals(listOf(Effect.CANCEL_TURN), effects)
        assertEquals(Status.Paused(PauseReason.NO_SPEECH), loop.status)
        // The cancelled turn returns to idle: hands-free must not reopen the mic by itself.
        assertEquals(emptyList<Effect>(), loop.handle(phase(VoicePhase.IDLE)))
    }

    @Test
    fun `a noisy background needs louder speech`() {
        val loop = recordingLoop()
        feed(loop, -30.0, 0.0, 1.0)
        // 8 dB above a -30 background is not speech (a -30 floor plus 14 dB puts the threshold at -16).
        feed(loop, -22.0, 1.0, 2.0)
        assertEquals(Status.Listening, loop.status)
        feed(loop, -10.0, 2.0, 2.5)
        assertEquals(Status.Hearing, loop.status)
    }

    @Test
    fun `thirty seconds of sound is cancelled not sent`() {
        val loop = recordingLoop()
        val effects = feed(loop, speech, 0.0, 30.5)
        assertEquals(listOf(Effect.CANCEL_TURN), effects, "continuous sound for 30 s is a TV or a crowd: never sent")
        assertEquals(Status.Paused(PauseReason.LONG_TURN), loop.status)
    }

    @Test
    fun `the recorder warm-up reading is not the room`() {
        val loop = recordingLoop()
        // -160 first (no audio metered yet), then a -30 room: -30 must set the floor, so -22 is not speech.
        loop.handle(Event.Level(-160.0, 0.0))
        feed(loop, -30.0, 0.1, 1.0)
        feed(loop, -22.0, 1.0, 2.0)
        assertEquals(Status.Listening, loop.status)
    }

    @Test
    fun `an empty transcript pauses instead of listening again`() {
        val loop = recordingLoop()
        feed(loop, speech, 0.0, 1.0)
        feed(loop, quiet, 1.0, 2.5)
        loop.handle(phase(VoicePhase.TRANSCRIBING))
        assertEquals(emptyList<Effect>(), loop.handle(Event.TurnHadNoWords))
        assertEquals(emptyList<Effect>(), loop.handle(phase(VoicePhase.IDLE)), "noise must not keep the loop going")
        assertEquals(Status.Paused(PauseReason.NO_WORDS), loop.status)
    }

    @Test
    fun `twenty turns without a touch pause`() {
        val loop = HandsFreeLoop()
        var begun = loop.handle(Event.Enable).size
        repeat(30) {
            loop.handle(phase(VoicePhase.RECORDING))
            loop.handle(phase(VoicePhase.TRANSCRIBING))
            begun += loop.handle(phase(VoicePhase.IDLE)).size
        }
        assertEquals(20, begun)
        assertEquals(Status.Paused(PauseReason.TURN_LIMIT), loop.status)
        assertEquals(listOf(Effect.BEGIN_TURN), loop.handle(Event.TogglePause), "a touch resets the count")
    }

    @Test
    fun `an interruption pauses so the mic does not reopen`() {
        val loop = recordingLoop()
        assertEquals(emptyList<Effect>(), loop.handle(Event.AudioInterrupted))
        assertEquals(emptyList<Effect>(), loop.handle(phase(VoicePhase.IDLE)))
        assertEquals(Status.Paused(PauseReason.INTERRUPTED), loop.status)
    }

    @Test
    fun `off then on again starts a turn`() {
        val loop = recordingLoop()
        assertEquals(listOf(Effect.CANCEL_TURN), loop.handle(Event.Disable))
        // The controller always delivers phases, also while off.
        assertEquals(emptyList<Effect>(), loop.handle(phase(VoicePhase.IDLE)))
        assertEquals(listOf(Effect.BEGIN_TURN), loop.handle(Event.Enable))
    }

    @Test
    fun `resume after a failure starts a turn from the failed phase`() {
        val loop = recordingLoop()
        loop.handle(phase(VoicePhase.TRANSCRIBING))
        loop.handle(phase(VoicePhase.FAILED))
        // The engine can stay in FAILED (no idle follows); Resume must still start a turn.
        assertEquals(listOf(Effect.BEGIN_TURN), loop.handle(Event.TogglePause))
    }

    @Test
    fun `after the partner replies the next turn starts`() {
        val loop = recordingLoop()
        feed(loop, speech, 0.0, 1.0)
        feed(loop, quiet, 1.0, 2.5)
        for (p in listOf(VoicePhase.TRANSCRIBING, VoicePhase.THINKING, VoicePhase.SPEAKING)) {
            assertEquals(emptyList<Effect>(), loop.handle(phase(p)))
            assertEquals(Status.Waiting, loop.status)
        }
        assertEquals(listOf(Effect.BEGIN_TURN), loop.handle(phase(VoicePhase.IDLE)))
    }

    @Test
    fun `a failure pauses and never retries by itself`() {
        val loop = recordingLoop()
        loop.handle(phase(VoicePhase.TRANSCRIBING))
        assertEquals(emptyList<Effect>(), loop.handle(phase(VoicePhase.FAILED)))
        assertEquals(Status.Paused(PauseReason.FAILURE), loop.status)
    }

    @Test
    fun `a refused microphone or a failed start pauses instead of asking again`() {
        val loop = HandsFreeLoop()
        assertEquals(listOf(Effect.BEGIN_TURN), loop.handle(Event.Enable))
        loop.handle(phase(VoicePhase.REQUESTING_PERMISSION))
        assertEquals(emptyList<Effect>(), loop.handle(phase(VoicePhase.IDLE)), "never a second permission request by itself")
        assertEquals(Status.Paused(PauseReason.FAILURE), loop.status)
    }

    @Test
    fun `pausing while recording cancels the turn and resuming starts one`() {
        val loop = recordingLoop()
        assertEquals(listOf(Effect.CANCEL_TURN), loop.handle(Event.TogglePause))
        assertEquals(Status.Paused(PauseReason.BY_LEARNER), loop.status)
        assertEquals(emptyList<Effect>(), loop.handle(phase(VoicePhase.IDLE)))
        assertEquals(listOf(Effect.BEGIN_TURN), loop.handle(Event.TogglePause))
    }

    @Test
    fun `turning it off cancels an open mic and ignores everything after`() {
        val loop = recordingLoop()
        assertEquals(listOf(Effect.CANCEL_TURN), loop.handle(Event.Disable))
        assertEquals(Status.Off, loop.status)
        assertEquals(emptyList<Effect>(), loop.handle(phase(VoicePhase.IDLE)))
        assertEquals(emptyList<Effect>(), feed(loop, speech, 0.0, 2.0))
    }

    @Test
    fun `levels outside recording are ignored`() {
        val loop = HandsFreeLoop()
        loop.handle(phase(VoicePhase.SPEAKING))
        loop.handle(Event.Enable)
        assertEquals(emptyList<Effect>(), feed(loop, quiet, 0.0, 10.0), "the partner's own reply is not a turn")
    }

    @Test
    fun `every status has a line except off`() {
        assertNull(HandsFreeCopy.statusLine(Status.Off))
        val paused = PauseReason.entries.map { Status.Paused(it) }
        for (status in listOf(Status.Waiting, Status.Listening, Status.Hearing) + paused) {
            assertNotNull(HandsFreeCopy.statusLine(status), "$status")
        }
        assertTrue(HandsFreeCopy.firstUseBody("Alphonso").contains("driving"))
    }

    @Test
    fun `the first use note names who is listening and says what works best`() {
        val practice = HandsFreeCopy.firstUseBody("Alphonso")
        assertTrue(practice.startsWith("Alphonso listens"))
        assertFalse(practice.contains("Hector"))
        assertTrue(HandsFreeCopy.firstUseBody("Hector").startsWith("Hector listens"))
        assertTrue(practice.contains("Best with earbuds or a quiet room."))
        assertEquals("Alphonso is replying...", HandsFreeCopy.statusLine(Status.Waiting, "Alphonso"))
        assertEquals("Hector is replying...", HandsFreeCopy.statusLine(Status.Waiting))
    }

    @Test
    fun `the note does not promise locked-screen use that Android does not have`() {
        assertFalse(HandsFreeCopy.firstUseBody("Alphonso").contains("locked"))
        assertTrue(HandsFreeCopy.firstUseBody("Alphonso").contains("screen is on"))
    }

    // Per-use tuning

    @Test
    fun `Hector ends the turn after one point two seconds of quiet`() {
        assertEquals(1.2, HandsFreeLoop.Tuning.HECTOR.endOfTurnSilence)
        assertEquals(HandsFreeLoop.Tuning.HECTOR, HandsFreeLoop().tuning, "the default is Hector's")
        val loop = recordingLoop(HandsFreeLoop.Tuning.HECTOR)
        feed(loop, quiet, 0.0, 0.5)
        feed(loop, speech, 0.5, 2.0)
        assertEquals(emptyList<Effect>(), feed(loop, quiet, 2.0, 3.0), "1.0 s of quiet: not yet")
        assertEquals(listOf(Effect.END_TURN), feed(loop, quiet, 3.0, 3.5))
    }

    @Test
    fun `Practice waits two and a half seconds so a thinking pause does not cut the turn`() {
        assertEquals(2.5, HandsFreeLoop.Tuning.PRACTICE.endOfTurnSilence)
        val loop = recordingLoop(HandsFreeLoop.Tuning.PRACTICE)
        feed(loop, quiet, 0.0, 0.5)
        feed(loop, speech, 0.5, 2.0)
        // 2.4 s of quiet (last loud sample at 1.9): still listening, and a late word keeps the same turn.
        assertEquals(emptyList<Effect>(), feed(loop, quiet, 2.0, 4.3))
        assertEquals(emptyList<Effect>(), feed(loop, speech, 4.3, 4.6))
        assertEquals(Status.Hearing, loop.status)
        assertEquals(listOf(Effect.END_TURN), feed(loop, quiet, 4.6, 7.3), "ends 2.5 s after the last loud sample")
    }

    @Test
    fun `Practice keeps every other limit of Hector`() {
        val practice = HandsFreeLoop.Tuning.PRACTICE.copy(endOfTurnSilence = HandsFreeLoop.Tuning.HECTOR.endOfTurnSilence)
        assertEquals(HandsFreeLoop.Tuning.HECTOR, practice, "only the end-of-turn silence differs")
        assertEquals(8.0, HandsFreeLoop.Tuning.PRACTICE.noSpeechTimeout)
        assertEquals(30.0, HandsFreeLoop.Tuning.PRACTICE.maxTurn)
        assertEquals(20, HandsFreeLoop.Tuning.PRACTICE.maxTurnsWithoutTouch)
    }

    @Test
    fun `Practice still cancels a nobody-spoke turn at eight seconds`() {
        val loop = recordingLoop(HandsFreeLoop.Tuning.PRACTICE)
        val effects = feed(loop, quiet, 0.0, 8.2)
        assertEquals(listOf(Effect.CANCEL_TURN), effects)
        assertEquals(Status.Paused(PauseReason.NO_SPEECH), loop.status)
    }

    @Test
    fun `the tuning numbers are the iOS numbers`() {
        val t = HandsFreeLoop.Tuning.HECTOR
        assertEquals(0.3, t.calibration)
        assertEquals(-35.0, t.maximumBackground)
        assertEquals(14.0, t.speechAboveFloor)
        assertEquals(-42.0, t.minimumSpeechLevel)
        assertEquals(0.2, t.speechOnset)
        assertEquals(8.0, t.noSpeechTimeout)
        assertEquals(30.0, t.maxTurn)
        assertEquals(20, t.maxTurnsWithoutTouch)
    }

    @Test
    fun `only losing the audio pauses, a duck does not`() {
        assertTrue(HandsFreeInterruption.pauses(-1))
        assertTrue(HandsFreeInterruption.pauses(-2))
        assertFalse(HandsFreeInterruption.pauses(-3), "a notification duck")
        assertFalse(HandsFreeInterruption.pauses(1), "a gain")
    }
}
