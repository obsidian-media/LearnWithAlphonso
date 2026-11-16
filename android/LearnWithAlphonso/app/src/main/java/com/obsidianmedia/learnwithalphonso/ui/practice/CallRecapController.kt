package com.obsidianmedia.learnwithalphonso.ui.practice

import com.obsidianmedia.learnwithalphonso.core.logic.CallRecap
import com.obsidianmedia.learnwithalphonso.core.net.AiConversationClient
import com.obsidianmedia.learnwithalphonso.core.net.ChatMessage
import kotlinx.coroutines.CoroutineScope
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
    enum class Status { OFF, PENDING, READY }
    enum class Review { IDLE, ADDING, ADDED, FAILED }
    data class Ui(val status: Status = Status.OFF, val recap: CallRecap? = null, val review: Review = Review.IDLE, val speaking: String? = null)

    private val _ui = MutableStateFlow(Ui())
    val ui: StateFlow<Ui> = _ui.asStateFlow()

    /** True once a recap was asked for (even if it failed): the separate weakness analysis then stays quiet. */
    var attempted = false
        private set
    private var callId: String? = null

    fun start(callId: String, transcript: List<ChatMessage>, scene: String?) {
        if (attempted || !CallRecap.qualifies(transcript.map { it.role })) return
        attempted = true
        this.callId = callId
        _ui.value = Ui(Status.PENDING)
        scope.launch {
            val recap = ai.callRecap(callId, transcript, scene = scene)
            _ui.update { if (recap == null) Ui() else Ui(Status.READY, recap) }
        }
    }

    fun reset() {
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
            _ui.update { it.copy(review = if (ok) Review.ADDED else Review.FAILED) }
        }
    }

    fun speaking(text: String?) = _ui.update { it.copy(speaking = text) }
}
