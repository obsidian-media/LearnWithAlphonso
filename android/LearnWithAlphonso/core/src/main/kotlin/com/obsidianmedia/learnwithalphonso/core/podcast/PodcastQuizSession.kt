package com.obsidianmedia.learnwithalphonso.core.podcast

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * One learner's pass through one quiz: the [PodcastQuizRun] plus the sending of its answers.
 *
 * [scope] is meant to be app-lifetime, not the screen's: leaving the quiz must not cancel a request the server may
 * already have applied, so the submit outlives the sheet. [submit] sends the answers and the finish time and returns the
 * SERVER's result; nothing here computes a score.
 */
class PodcastQuizSession(
    offer: PodcastQuizOffer,
    private val scope: CoroutineScope,
    private val submit: suspend (answers: List<PodcastQuizAnswer>, completedAtMillis: Long) -> PodcastQuizResult,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    /** Called with the server's result once saved, so the caller can refresh its "best" label. */
    private val onSaved: (PodcastQuizResult) -> Unit = {},
) {
    private val _run = MutableStateFlow(PodcastQuizRun(offer.questions))
    val run: StateFlow<PodcastQuizRun> = _run.asStateFlow()
    val best: PodcastQuizBest? = offer.best

    /** When the learner finished the last question; sent so the server credits the right activity day. */
    private var finishedAtMillis = 0L

    fun select(choice: Int) = _run.update { it.select(choice) }

    fun check() = _run.update { it.check() }

    /** Next question, or, after the last one, send the answers. */
    fun next() {
        val before = _run.value
        val after = before.next()
        _run.value = after
        if (before.phase != PodcastQuizPhase.Submitting && after.phase == PodcastQuizPhase.Submitting) {
            finishedAtMillis = nowMillis()
            send()
        }
    }

    /** Resend the same answers after a retryable failure. */
    fun retry() {
        val before = _run.value
        val after = before.retry()
        if (after == before) return
        _run.value = after
        send()
    }

    private fun send() {
        val answers = _run.value.answers
        val finished = finishedAtMillis
        scope.launch {
            try {
                val result = submit(answers, finished)
                _run.update { it.saved(result) }
                onSaved(result)
            } catch (e: CancellationException) {
                throw e
            } catch (e: PodcastQuizException) {
                _run.update { it.failed(e.error) }
            } catch (e: Exception) {
                _run.update { it.failed(PodcastQuizError.SERVER) }
            }
        }
    }

    private inline fun MutableStateFlow<PodcastQuizRun>.update(f: (PodcastQuizRun) -> PodcastQuizRun) {
        value = f(value)
    }
}
