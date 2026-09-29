package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.net.SttResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** What the engine needs from a platform recorder; the app's MediaRecorder wrapper implements it. */
interface RecorderPort {
    fun start()
    fun remainingMillisToMinimumDuration(): Long?
    fun elapsedMillis(): Long?
    suspend fun stop(): ByteArray?
    fun cancelIfRecording()
}

enum class TurnPhase { IDLE, REQUESTING_MIC, RECORDING, TRANSCRIBING }

sealed interface TurnEvent {
    data class Transcribed(val text: String, val confidence: Double?, val debugTiming: String) : TurnEvent
    data object Empty : TurnEvent
    data object MicDenied : TurnEvent
    data class Failed(val message: String) : TurnEvent
}

/**
 * The press-and-hold turn state machine every recording screen on iOS
 * carries a private copy of (SpeakQuestionCard, ConversationView,
 * CampaignView, HectorView), extracted once and tested on the JVM.
 *
 * Rules kept from those copies: a press that ends while the microphone
 * permission is still being requested stops the recording the moment it
 * starts (`wantsToStop`); a recording waits out the 0.4 s minimum before
 * stopping; anything under `MINIMUM_AUDIO_BYTES` is "nothing captured";
 * a generation counter drops a stop that belongs to an older press; and
 * `tearDown` cancels without emitting.
 */
class ConversationTurnEngine(
    private val recorder: RecorderPort,
    private val requestMic: suspend () -> Boolean,
    private val transcribe: suspend (ByteArray, String) -> SttResult,
    private val scope: CoroutineScope,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {
    private val _phase = MutableStateFlow(TurnPhase.IDLE)
    val phase: StateFlow<TurnPhase> = _phase.asStateFlow()

    private val _events = MutableSharedFlow<TurnEvent>(extraBufferCapacity = 8)
    val events: SharedFlow<TurnEvent> = _events.asSharedFlow()

    private var wantsToStop = false
    private var generation = 0
    private var tornDown = false
    private var pressBeganAt: Long? = null

    fun pressBegan() {
        if (tornDown || _phase.value != TurnPhase.IDLE) return
        pressBeganAt = nowMillis()
        generation += 1
        _phase.value = TurnPhase.REQUESTING_MIC
        val myGeneration = generation
        scope.launch {
            val granted = requestMic()
            if (tornDown || myGeneration != generation) return@launch
            if (!granted) {
                _phase.value = TurnPhase.IDLE
                wantsToStop = false
                _events.tryEmit(TurnEvent.MicDenied)
                return@launch
            }
            try {
                recorder.start()
            } catch (e: Exception) {
                _phase.value = TurnPhase.IDLE
                wantsToStop = false
                _events.tryEmit(TurnEvent.Failed("Couldn't access the microphone."))
                return@launch
            }
            _phase.value = TurnPhase.RECORDING
            if (wantsToStop) {
                wantsToStop = false
                stopAndTranscribe()
            }
        }
    }

    fun pressEnded() {
        when (_phase.value) {
            TurnPhase.REQUESTING_MIC -> wantsToStop = true
            TurnPhase.RECORDING -> stopAndTranscribe()
            else -> Unit
        }
    }

    /** The screen is going away: cancel silently, and ignore anything still in flight. */
    fun tearDown() {
        tornDown = true
        generation += 1
        recorder.cancelIfRecording()
        _phase.value = TurnPhase.IDLE
    }

    private fun stopAndTranscribe() {
        if (_phase.value != TurnPhase.RECORDING) return
        _phase.value = TurnPhase.TRANSCRIBING
        val myGeneration = generation
        val pressElapsed = pressBeganAt?.let { nowMillis() - it }
        scope.launch {
            recorder.remainingMillisToMinimumDuration()?.let { delay(it) }
            if (tornDown || myGeneration != generation) return@launch
            val captureElapsed = recorder.elapsedMillis()
            val audio = recorder.stop()
            if (audio == null || audio.size < MINIMUM_AUDIO_BYTES) {
                _phase.value = TurnPhase.IDLE
                _events.tryEmit(TurnEvent.Empty)
                return@launch
            }
            val timing = "press=${fmt(pressElapsed)} capture=${fmt(captureElapsed)}"
            val result = runCatching { transcribe(audio, timing) }
            if (tornDown || myGeneration != generation) return@launch
            _phase.value = TurnPhase.IDLE
            result.fold(
                onSuccess = { r -> if (r.text.isBlank()) _events.tryEmit(TurnEvent.Empty) else _events.tryEmit(TurnEvent.Transcribed(r.text.trim(), r.confidence, timing)) },
                onFailure = { e -> _events.tryEmit(TurnEvent.Failed(e.message ?: "Couldn't check that just now. Try again.")) },
            )
        }
    }

    private fun fmt(ms: Long?): String = ms?.let { "%.2f".format(it / 1000.0) } ?: "?"

    companion object {
        const val MINIMUM_AUDIO_BYTES = 4_096
        const val MINIMUM_DURATION_MS = 400L
    }
}
