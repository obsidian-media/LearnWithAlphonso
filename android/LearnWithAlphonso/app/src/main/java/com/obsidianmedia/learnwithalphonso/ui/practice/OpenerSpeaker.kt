package com.obsidianmedia.learnwithalphonso.ui.practice

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Says one of our own fixed lines through the same player as a reply, so the call's lips and caption follow it:
 * Alphonso's scene openers (BaseConversationViewModel) and Hector's greeting (HectorViewModel). The audio comes from
 * [cache] (OpenerSpeechCache), so returning to the call replays it instead of asking /api/tts again.
 *
 * A reply still playing finishes first. Thinking while the voice loads (the mic waits), speaking while it plays;
 * never over a recording. [stop] (the learner holds to talk, or leaves) cancels it, which stops its playback.
 */
class OpenerSpeaker(
    private val scope: CoroutineScope,
    private val state: MutableStateFlow<ConversationUiState>,
    private val engineIdle: () -> Boolean,
    private val player: ReplyPlayer,
    private val cache: OpenerSpeechCache,
    private val course: String,
    private val synthesize: suspend (text: String, voice: String?) -> ByteArray,
) {
    // The line being fetched or spoken. While it holds the phase (thinking or speaking), stopping it hands it back.
    private var job: Job? = null
    private var active = false
    private var holdsPhase = false
    private var token = 0

    /** `pending` is read again once the session is idle: a line the learner has answered by then is not said. */
    fun speak(pending: () -> String?, voice: () -> String?) {
        if (pending() == null || active) return
        active = true
        val mine = ++token
        job = scope.launch {
            try {
                state.first { it.phase == ConversationPhase.IDLE }
                val text = pending() ?: return@launch
                if (!engineIdle()) return@launch
                holdsPhase = true
                state.update { it.copy(phase = ConversationPhase.THINKING) }
                val chosen = voice()
                val audio = cache.audio(text, chosen, course) { synthesize(text, chosen) }
                state.update { it.copy(phase = ConversationPhase.SPEAKING) }
                player.play(audio)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // The line is already on screen: a missing voice is not an error to show.
            } finally {
                // Only the current line hands the phase back: one that was stopped (a press, leaving) may finish
                // after a newer one started, and must not clear that one's flags.
                if (active && token == mine) {
                    active = false
                    if (holdsPhase) state.update { it.copy(phase = ConversationPhase.IDLE) }
                    holdsPhase = false
                }
            }
        }
    }

    fun stop() {
        if (!active) return
        active = false
        job?.cancel()
        job = null
        if (holdsPhase) state.update { it.copy(phase = ConversationPhase.IDLE) }
        holdsPhase = false
    }
}
