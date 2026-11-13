package com.obsidianmedia.learnwithalphonso.core.logic

import com.obsidianmedia.learnwithalphonso.core.net.ExplainErrorKind
import com.obsidianmedia.learnwithalphonso.core.net.ExplainException
import com.obsidianmedia.learnwithalphonso.core.net.Explanation
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface ExplainPhase {
    data object Idle : ExplainPhase
    data object Loading : ExplainPhase
    data class Shown(val result: Explanation) : ExplainPhase
    data class Failed(val kind: ExplainErrorKind) : ExplainPhase

    /** The account has not allowed AI: the screen shows the consent choice, then calls [ExplainFlow.run] again if allowed. */
    data object NeedsConsent : ExplainPhase
}

/**
 * One "Explain in my language" item on one screen: idle until asked (or asked at once for "Always show"), then loading,
 * then the explanation or a failure the learner can read. Same consent order as saving a word: an explanation sends the
 * item to the AI service, so the account's consent comes first, and a setting that cannot be read is never "off".
 */
class ExplainFlow(
    private val request: ExplainRequest,
    private val explain: suspend (ExplainRequest) -> Explanation,
    private val consent: AiConsentStore,
    private val hasSession: () -> Boolean,
    private val scope: CoroutineScope,
) {
    private val _phase = MutableStateFlow<ExplainPhase>(ExplainPhase.Idle)
    val phase: StateFlow<ExplainPhase> = _phase.asStateFlow()

    /** Starts (or retries) the explanation. Only one request may be in flight; a second tap is ignored. Returns the job so a test can join it. */
    fun run(): Job {
        if (_phase.value == ExplainPhase.Loading) return DONE
        _phase.value = ExplainPhase.Loading
        return scope.launch { fetch() }
    }

    /** "Show in English" / "Hide": back to the chip. */
    fun hide() {
        _phase.update { if (it is ExplainPhase.Shown || it is ExplainPhase.Failed) ExplainPhase.Idle else it }
    }

    /** The learner chose "Not now" on the consent choice: back to the chip, nothing was sent. */
    fun declineConsent() {
        _phase.update { if (it == ExplainPhase.NeedsConsent) ExplainPhase.Idle else it }
    }

    private suspend fun fetch() {
        if (!consent.isGranted) consent.refresh()
        when (consent.statusOf()) {
            AiConsentStatus.GRANTED -> Unit
            AiConsentStatus.DENIED -> { _phase.value = ExplainPhase.NeedsConsent; return }
            AiConsentStatus.LOADING, AiConsentStatus.UNAVAILABLE -> { _phase.value = ExplainPhase.Failed(ExplainErrorKind.UNAVAILABLE); return }
        }
        if (!hasSession()) { _phase.value = ExplainPhase.Failed(ExplainErrorKind.NOT_SIGNED_IN); return }
        try {
            _phase.value = ExplainPhase.Shown(explain(request))
        } catch (e: CancellationException) {
            throw e
        } catch (e: ExplainException) {
            if (e.kind == ExplainErrorKind.AI_CONSENT_REQUIRED) {
                // Withdrawn on another device since the screen opened.
                consent.refresh()
                _phase.value = ExplainPhase.NeedsConsent
            } else {
                _phase.value = ExplainPhase.Failed(e.kind)
            }
        } catch (e: Exception) {
            _phase.value = ExplainPhase.Failed(ExplainErrorKind.UNAVAILABLE)
        }
    }

    private companion object {
        val DONE: Job = Job().also { it.complete() }
    }
}
