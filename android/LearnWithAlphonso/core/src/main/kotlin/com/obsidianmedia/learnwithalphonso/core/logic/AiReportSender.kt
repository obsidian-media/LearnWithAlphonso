package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Sends one AI-reply report at a time, on a scope that outlives any bubble: a rotation or scrolling the bubble away
 * neither cancels the request nor loses its result, and a second tap while one is in flight cannot create a second row.
 */
class AiReportSender(
    private val send: suspend (AiResponseReport) -> Unit,
    private val scope: CoroutineScope,
) {
    data class State(
        val sending: Boolean = false,
        /** What to tell the learner once the request ended, until they dismiss it. */
        val message: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** Starts sending, or returns null (and does nothing) when a report is already in flight. */
    fun submit(report: AiResponseReport): Job? {
        var accepted = false
        _state.update { current ->
            if (current.sending) current else { accepted = true; State(sending = true) }
        }
        if (!accepted) return null
        return scope.launch {
            val message = try {
                send(report)
                AiConsentCopy.reportThanks
            } catch (e: CancellationException) {
                _state.update { State() }
                throw e
            } catch (e: Exception) {
                AiConsentCopy.reportFailed
            }
            _state.update { State(sending = false, message = message) }
        }
    }

    fun dismissMessage() = _state.update { if (it.sending) it else State() }
}
