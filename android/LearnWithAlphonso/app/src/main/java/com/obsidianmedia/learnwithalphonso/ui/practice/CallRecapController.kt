package com.obsidianmedia.learnwithalphonso.ui.practice

import com.obsidianmedia.learnwithalphonso.core.logic.CallRecap
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage
import com.obsidianmedia.learnwithalphonso.core.rehearsal.RehearsalSpeaking
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The result screen's recap. It starts when the result appears and never holds the screen up: while it is pending the
 * screen shows a placeholder, and when it is over (done, empty, failed, offline, timed out) the slip block takes the
 * slot back. A call too short for a recap is OFF from the start. One attempt per call.
 */
class CallRecapController(private val ai: AiConversationClient, private val scope: CoroutineScope) {
    /** FAILED: the attempt did not work and the call is not used up, so "Try again" is offered next to the slip. */
    enum class Status { OFF, PENDING, READY, FAILED }
    enum class Review { IDLE, ADDING, ADDED, FAILED }
    data class Ui(val status: Status = Status.OFF, val recap: CallRecap? = null, val review: Review = Review.IDLE, val speaking: String? = null, val rehearsalSpeaking: RehearsalSpeaking? = null)

    private val _ui = MutableStateFlow(Ui())
    val ui: StateFlow<Ui> = _ui.asStateFlow()

    /** True once a recap was asked for (even if it failed): the separate weakness analysis then stays quiet. */
    var attempted = false
        private set
    private var callId: String? = null
    private var job: Job? = null
    private var transcript: List<ChatMessage> = emptyList()
    private var scene: String? = null

    fun start(callId: String, transcript: List<ChatMessage>, scene: String?) {
        if (attempted || !CallRecap.qualifies(transcript.map { it.role })) return
        attempted = true
        this.callId = callId
        this.transcript = transcript
        this.scene = scene
        launchAttempt(callId)
    }

    /** "Try again" after a failed attempt: the server released the call, so one more attempt may succeed. */
    fun retry() {
        val id = callId ?: return
        if (_ui.value.status != Status.FAILED) return
        launchAttempt(id)
    }

    private fun launchAttempt(callId: String) {
        _ui.value = Ui(Status.PENDING)
        job = scope.launch {
            val attempt = ai.callRecapAttempt(callId, transcript, scene = scene)
            // A retry or the next scene may have reset this call while it was pending: its recap is not shown.
            if (this@CallRecapController.callId != callId) return@launch
            _ui.update {
                when (attempt) {
                    is AiConversationClient.RecapAttempt.Got -> Ui(Status.READY, attempt.recap, rehearsalSpeaking = attempt.rehearsalSpeaking)
                    is AiConversationClient.RecapAttempt.SpeakingOnly -> Ui(rehearsalSpeaking = attempt.rehearsalSpeaking)
                    AiConversationClient.RecapAttempt.Retry -> Ui(Status.FAILED)
                    AiConversationClient.RecapAttempt.Empty -> Ui()
                }
            }
        }
    }

    fun reset() {
        job?.cancel()
        job = null
        attempted = false
        callId = null
        _ui.value = Ui()
    }

    fun addToReview() {
        val token = _ui.value.recap?.reviewToken ?: return
        val id = callId ?: return
        if (_ui.value.review == Review.ADDING || _ui.value.review == Review.ADDED) return
        _ui.update { it.copy(review = Review.ADDING) }
        scope.launch {
            val ok = ai.addRecapToReview(id, token)
            if (callId != id) return@launch
            _ui.update { it.copy(review = if (ok) Review.ADDED else Review.FAILED) }
        }
    }

    fun speaking(text: String?) = _ui.update { it.copy(speaking = text) }
}
