package com.obsidianmedia.learnwithalphonso.ui.practice.call

import com.obsidianmedia.learnwithalphonso.core.logic.ConversationTurnEngine
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeController
import com.obsidianmedia.learnwithalphonso.core.logic.HandsFreeLoop
import com.obsidianmedia.learnwithalphonso.core.logic.TurnEvent
import com.obsidianmedia.learnwithalphonso.core.logic.TurnPhase
import com.obsidianmedia.learnwithalphonso.core.logic.VoicePhase
import com.obsidianmedia.learnwithalphonso.ui.practice.ConversationPhase
import com.obsidianmedia.learnwithalphonso.ui.practice.ConversationUiState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * The one place hands-free meets a conversation view model (Practice scenarios, campaigns, Hector), so the three behave
 * the same: the phase the loop sees, the turn events it must hear, and the call-level effects.
 */
object HandsFreeBinding {
    /**
     * The voice engine's phase as the loop sees it. The engine's own phases win while it is busy; after it returns to
     * idle, the conversation's phase (transcribing was set by the release, then thinking, then speaking) keeps the loop
     * waiting until the reply has finished playing: the mic opens only after it, with no barge-in.
     */
    fun voicePhase(engine: TurnPhase, conversation: ConversationPhase): VoicePhase = when {
        engine == TurnPhase.REQUESTING_MIC -> VoicePhase.REQUESTING_PERMISSION
        engine == TurnPhase.RECORDING -> VoicePhase.RECORDING
        engine == TurnPhase.TRANSCRIBING -> VoicePhase.TRANSCRIBING
        conversation == ConversationPhase.TRANSCRIBING -> VoicePhase.TRANSCRIBING
        conversation == ConversationPhase.THINKING -> VoicePhase.THINKING
        conversation == ConversationPhase.SPEAKING -> VoicePhase.SPEAKING
        else -> VoicePhase.IDLE
    }

    /** Feeds the loop every change of the combined phase, also while hands-free is off (so turning it on mid-reply waits). */
    fun feedPhases(scope: CoroutineScope, controller: HandsFreeController, engine: ConversationTurnEngine, state: StateFlow<ConversationUiState>) {
        // However hands-free got paused (a failure, an interruption, noise, the learner), the mic is released at once:
        // a pause must never leave a recorder, or one still starting, open.
        scope.launch {
            controller.status.collect { status ->
                if (status is HandsFreeLoop.Status.Paused) releaseMic(engine)
            }
        }
        scope.launch {
            combine(engine.phase, state.map { it.phase }) { e, c -> voicePhase(e, c) }.distinctUntilChanged().collect { controller.phase(it) }
        }
    }

    /**
     * What a turn event means to hands-free, called BEFORE the view model resets the conversation phase to idle (the
     * loop must hear the failure or the empty transcript first, or it would listen again):
     * a blank transcript pauses (noise, not speech); a refused microphone or a failure pauses; a too-short capture just
     * listens again, as on iOS.
     */
    fun onTurnEvent(controller: HandsFreeController, event: TurnEvent) {
        when (event) {
            TurnEvent.Empty -> controller.turnHadNoWords()
            TurnEvent.MicDenied, is TurnEvent.Failed -> controller.failed()
            TurnEvent.TooShort, is TurnEvent.Transcribed -> Unit
        }
    }

    /** The message a turn event shows: hands-free has no button to hold, so its own status line says what happens next. */
    /**
     * Starts hands-free from the stored choice exactly once, and only after BOTH the screen armed it ([arm]) and the
     * opening line finished ([openerFinished]), in either order: the mic never opens under the opener.
     */
    class StoredStart(private val controller: HandsFreeController, private val isOver: () -> Boolean) {
        private var check: (() -> Boolean)? = null
        private var finished = false
        private var applied = false

        fun arm(check: () -> Boolean) { this.check = check; tryApply() }
        fun openerFinished() { finished = true; tryApply() }

        private fun tryApply() {
            val c = check ?: return
            if (!finished || applied) return
            applied = true
            if (!controller.isOn && !isOver() && c()) controller.enable()
        }
    }

    /** Whether a new call starts hands-free from the stored choice (see [ApplyStoredHandsFree]). */
    fun shouldAutoStart(preferred: Boolean, micGranted: Boolean, alreadyOn: Boolean, finished: Boolean): Boolean =
        preferred && micGranted && !alreadyOn && !finished

    fun errorFor(handsFreeOn: Boolean, event: TurnEvent, message: String): String? = when {
        handsFreeOn && (event == TurnEvent.Empty || event == TurnEvent.TooShort) -> null
        else -> message
    }

    /**
     * Another app, a phone call or removed earbuds took the audio: hands-free pauses and an open recording is dropped
     * (nothing sent). A turn already being transcribed or answered is left to finish.
     */
    fun interrupted(controller: HandsFreeController, engine: ConversationTurnEngine) {
        controller.audioInterrupted()
        releaseMic(engine)
    }

    /**
     * Releases the microphone, and only the microphone: a recording (or one still being set up) is dropped, while a turn
     * already being transcribed or answered is left to finish, as on iOS (its loop cancels only an open recording).
     * Cancelling a turn in flight would drop its reply with no event, leaving the call busy for good.
     */
    fun releaseMic(engine: ConversationTurnEngine) {
        val phase = engine.phase.value
        if (phase == TurnPhase.RECORDING || phase == TurnPhase.REQUESTING_MIC) engine.cancel()
    }

    /** Applies a controller's effects to a conversation: a press, a release, an interruption. */
    fun newController(tuning: HandsFreeLoop.Tuning, press: () -> Unit, release: () -> Unit, cancel: () -> Unit) =
        HandsFreeController(tuning) { effect ->
            when (effect) {
                HandsFreeLoop.Effect.BEGIN_TURN -> press()
                HandsFreeLoop.Effect.END_TURN -> release()
                HandsFreeLoop.Effect.CANCEL_TURN -> cancel()
            }
        }
}
