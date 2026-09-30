package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.net.SttResult
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.plus
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationTurnEngineTest {
    private class FakeRecorder(private val bytes: Int = 8_000, private val startedAtMs: () -> Long) : RecorderPort {
        var started = 0
        var stopped = 0
        var cancelled = 0
        var recording = false
        private var startedAt: Long? = null
        var failStart = false
        override fun start() {
            if (failStart) throw IllegalStateException("no mic")
            started++; recording = true; startedAt = startedAtMs()
        }
        override fun remainingMillisToMinimumDuration(): Long? = startedAt?.let { s -> (ConversationTurnEngine.MINIMUM_DURATION_MS - (startedAtMs() - s)).takeIf { it > 0 } }
        override fun elapsedMillis(): Long? = startedAt?.let { startedAtMs() - it }
        override suspend fun stop(): ByteArray? { stopped++; recording = false; return ByteArray(bytes) }
        override fun cancelIfRecording() { if (recording) { cancelled++; recording = false } }
    }

    private fun runEngine(
        bytes: Int = 8_000,
        grant: suspend () -> Boolean = { true },
        transcribe: suspend (ByteArray, String) -> SttResult = { _, _ -> SttResult("she is a doctor", 0.9) },
        block: suspend kotlinx.coroutines.test.TestScope.(ConversationTurnEngine, FakeRecorder, MutableList<TurnEvent>) -> Unit,
    ) = runTest {
        val recorder = FakeRecorder(bytes) { testScheduler.currentTime }
        val engine = ConversationTurnEngine(recorder, grant, transcribe, this + UnconfinedTestDispatcher(testScheduler)) { testScheduler.currentTime }
        val events = ArrayList<TurnEvent>()
        val collector = launch(UnconfinedTestDispatcher(testScheduler)) { engine.events.toList(events) }
        block(engine, recorder, events)
        collector.cancel()
    }


    @Test
    fun `a normal press records, waits the minimum, transcribes and emits`() = runEngine { engine, recorder, events ->
        engine.pressBegan()
        assertEquals(TurnPhase.RECORDING, engine.phase.value)
        advanceTimeBy(100)
        engine.pressEnded()
        assertEquals(TurnPhase.TRANSCRIBING, engine.phase.value)
        assertEquals(0, recorder.stopped)
        advanceUntilIdle()
        assertEquals(1, recorder.stopped)
        assertEquals(TurnPhase.IDLE, engine.phase.value)
        val t = events.single() as TurnEvent.Transcribed
        assertEquals("she is a doctor", t.text)
        assertEquals("press=0.10 capture=0.40", t.debugTiming)
    }

    @Test
    fun `a release during the permission wait stops right after the recording starts`() {
        // Plan 3 Review Focus 1.
        val gate = CompletableDeferred<Boolean>()
        runEngine(grant = { gate.await() }) { engine, recorder, events ->
            engine.pressBegan()
            assertEquals(TurnPhase.REQUESTING_MIC, engine.phase.value)
            engine.pressEnded()
            gate.complete(true)
            advanceUntilIdle()
            assertEquals(1, recorder.started)
            assertEquals(1, recorder.stopped)
            assertFalse(recorder.recording)
            assertTrue(events.single() is TurnEvent.Transcribed)
        }
    }

    @Test
    fun `denied permission emits MicDenied and returns to idle`() = runEngine(grant = { false }) { engine, recorder, events ->
        engine.pressBegan()
        advanceUntilIdle()
        assertEquals(TurnPhase.IDLE, engine.phase.value)
        assertEquals(0, recorder.started)
        assertEquals(listOf<TurnEvent>(TurnEvent.MicDenied), events)
    }

    @Test
    fun `too little audio is Empty, never a transcript`() = runEngine(bytes = 100) { engine, _, events ->
        engine.pressBegan(); engine.pressEnded(); advanceUntilIdle()
        assertEquals(listOf<TurnEvent>(TurnEvent.Empty), events)
    }

    @Test
    fun `a blank transcript is Empty and a failed transcription is Failed`() {
        runEngine(transcribe = { _, _ -> SttResult("   ", null) }) { engine, _, events ->
            engine.pressBegan(); engine.pressEnded(); advanceUntilIdle()
            assertEquals(listOf<TurnEvent>(TurnEvent.Empty), events)
        }
        runEngine(transcribe = { _, _ -> throw IllegalStateException("boom") }) { engine, _, events ->
            engine.pressBegan(); engine.pressEnded(); advanceUntilIdle()
            assertEquals(TurnEvent.Failed("boom"), events.single())
        }
    }

    @Test
    fun `teardown mid-recording cancels silently and later presses are ignored`() {
        // Plan 3 Review Focus 3.
        runEngine { engine, recorder, events ->
            engine.pressBegan()
            engine.tearDown()
            assertEquals(1, recorder.cancelled)
            assertEquals(TurnPhase.IDLE, engine.phase.value)
            engine.pressBegan()
            advanceUntilIdle()
            assertEquals(1, recorder.started)
            assertTrue(events.isEmpty())
        }
    }

    @Test
    fun `a stale stop from an older press is dropped`() = runEngine { engine, recorder, events ->
        engine.pressBegan()
        engine.pressEnded() // transcribing, waiting out the minimum duration
        engine.tearDown()   // bumps the generation while the stop is pending
        advanceUntilIdle()
        assertEquals(0, recorder.stopped)
        assertTrue(events.isEmpty())
    }

    @Test
    fun `a recorder that fails to start reports Failed`() = runEngine { engine, recorder, events ->
        recorder.failStart = true
        engine.pressBegan()
        advanceUntilIdle()
        assertEquals(TurnPhase.IDLE, engine.phase.value)
        assertTrue(events.single() is TurnEvent.Failed)
    }

    @Test
    fun `cancel drops the press in flight and the next press works, tearDown refuses every later press`() = runEngine { engine, recorder, events ->
        // Review 2026-09-30: the composable's dispose (a rotation) must not kill the microphone for the surviving view model.
        engine.pressBegan()
        advanceTimeBy(100)
        engine.cancel()
        assertEquals(TurnPhase.IDLE, engine.phase.value)
        assertEquals(1, recorder.cancelled)
        advanceUntilIdle()
        assertTrue(events.isEmpty(), "a cancelled press emits nothing")

        engine.pressBegan()
        assertEquals(TurnPhase.RECORDING, engine.phase.value)
        advanceTimeBy(500)
        engine.pressEnded()
        advanceUntilIdle()
        assertTrue(events.single() is TurnEvent.Transcribed)

        engine.tearDown()
        engine.pressBegan()
        assertEquals(TurnPhase.IDLE, engine.phase.value)
        assertEquals(2, recorder.started)
    }
}
