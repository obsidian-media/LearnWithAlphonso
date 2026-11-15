package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Runs a [HandsFreeLoop] for one call and performs its effects, as iOS's `VoiceSessionController` does: `BeginTurn` is a
 * press, `EndTurn` a release, `CancelTurn` an interruption. The status is published only when it changes (a level
 * sample arrives many times a second), so the call screen observes [status] cheaply.
 *
 * Off every time a call starts: a controller is made per conversation view model and [disable]d when its screen
 * leaves, and nothing about the switch is stored (the same as iOS, where the voice controller is made per call).
 * Call it from one thread (the main thread).
 */
class HandsFreeController(
    tuning: HandsFreeLoop.Tuning,
    private val perform: (HandsFreeLoop.Effect) -> Unit,
) {
    private val loop = HandsFreeLoop(tuning)
    private val _status = MutableStateFlow<HandsFreeLoop.Status>(HandsFreeLoop.Status.Off)
    val status: StateFlow<HandsFreeLoop.Status> = _status.asStateFlow()
    val isOn: Boolean get() = loop.isOn
    val tuning: HandsFreeLoop.Tuning get() = loop.tuning

    fun enable() = run(HandsFreeLoop.Event.Enable)
    /**
     * Turning it off always cancels the turn, even when the loop only knows a recording is being set up (the permission
     * prompt, the recorder starting): the engine drops a start that is still in flight, so a late recorder never opens
     * the mic with hands-free off.
     */
    fun disable() {
        val wasOn = loop.isOn
        run(HandsFreeLoop.Event.Disable)
        if (wasOn) perform(HandsFreeLoop.Effect.CANCEL_TURN)
    }

    /** Pausing likewise cancels unconditionally; resuming starts a turn. */
    fun togglePause() {
        val resuming = loop.status is HandsFreeLoop.Status.Paused
        val wasOn = loop.isOn
        run(HandsFreeLoop.Event.TogglePause)
        if (wasOn && !resuming) perform(HandsFreeLoop.Effect.CANCEL_TURN)
    }

    /** The wall clock, once per beat while recording, with or without a readable level. */
    fun tick(atSeconds: Double) {
        if (!loop.isOn) return
        run(HandsFreeLoop.Event.Tick(atSeconds))
    }

    /** The voice engine's phase changed; delivered also while off, so turning it on mid-reply waits for the reply. */
    fun phase(phase: VoicePhase) = run(HandsFreeLoop.Event.Phase(phase))

    /** One recorder level sample, `atSeconds` on any steady clock. */
    fun level(dBFS: Double, atSeconds: Double) {
        if (!loop.isOn) return
        run(HandsFreeLoop.Event.Level(dBFS, atSeconds))
    }

    /** The finished turn's transcript was empty (noise, not speech): pause instead of listening again. */
    fun turnHadNoWords() = run(HandsFreeLoop.Event.TurnHadNoWords)

    /** A phone call, another app, or removed earbuds took the audio. */
    fun audioInterrupted() = run(HandsFreeLoop.Event.AudioInterrupted)

    /** A failure of the turn (network, consent, a refused microphone): pauses, never retries by itself. */
    fun failed() = run(HandsFreeLoop.Event.Phase(VoicePhase.FAILED))

    private fun run(event: HandsFreeLoop.Event) {
        val effects = loop.handle(event)
        if (loop.status != _status.value) _status.value = loop.status
        effects.forEach(perform)
    }
}

/**
 * Which audio-focus changes pause hands-free (the Android counterpart of iOS's interruptions): another app or a phone
 * call took the audio for good (`AUDIOFOCUS_LOSS`, -1) or for a while (`AUDIOFOCUS_LOSS_TRANSIENT`, -2). A duck (-3, a
 * notification sound) and a gain do not. The numbers are `AudioManager`'s constants, which core cannot import.
 */
object HandsFreeInterruption {
    const val AUDIOFOCUS_LOSS = -1
    const val AUDIOFOCUS_LOSS_TRANSIENT = -2

    fun pauses(focusChange: Int): Boolean = focusChange == AUDIOFOCUS_LOSS || focusChange == AUDIOFOCUS_LOSS_TRANSIENT
}
