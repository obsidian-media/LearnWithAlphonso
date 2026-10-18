package com.obsidianmedia.learnwithalphonso.ui.word

import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentStatus
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentStore
import com.obsidianmedia.learnwithalphonso.core.logic.SaveWordRequest
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordError
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordException
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordResult
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordRules
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.nio.channels.UnresolvedAddressException

sealed interface SaveWordPhase {
    data object Idle : SaveWordPhase
    data object Saving : SaveWordPhase
    data class Saved(val result: SavedWordResult) : SaveWordPhase
    data class Failed(val error: SavedWordError) : SaveWordPhase

    /** The account has not allowed AI: the screen shows the consent choice, then calls [SaveWordViewModel.save] again if allowed. */
    data object NeedsConsent : SaveWordPhase
}

/**
 * One tap on a word: shows it with its sentence, saves it on demand and then holds the meaning so the learner learns it
 * now, not only at review. Port of SaveWordSheet.save() in SaveWordSheet.swift. Every failure is a message in the sheet;
 * nothing here blocks the screen underneath.
 */
class SaveWordFlow(
    val request: SaveWordRequest,
    private val define: suspend (word: String, sentence: String, course: String) -> SavedWordResult,
    private val consent: AiConsentStore,
    private val hasSession: () -> Boolean,
    /** The sheet's own scope: the flow lives and dies with the sheet, never in an Activity-wide store (see [SaveWordTaps]). */
    private val scope: CoroutineScope,
) {
    private val _phase = MutableStateFlow<SaveWordPhase>(SaveWordPhase.Idle)
    val phase: StateFlow<SaveWordPhase> = _phase.asStateFlow()

    /** Returns the job so a test can join it. */
    fun save(): Job {
        // Two quick taps would otherwise send two requests and charge the `define` quota twice (the server survives the
        // race, but the second call is still billed); only one save may be in flight. Set before any suspension, so a
        // second tap during the consent read is blocked too.
        if (_phase.value == SaveWordPhase.Saving) return DONE
        _phase.value = SaveWordPhase.Saving
        return scope.launch { run() }
    }

    /** The learner chose "Not now" on the consent choice: back to the Save button, nothing was sent. */
    fun declineConsent() {
        _phase.update { if (it == SaveWordPhase.NeedsConsent) SaveWordPhase.Idle else it }
    }

    private suspend fun run() {
        // The word and sentence go to NVIDIA, so the account's AI consent applies. Anything but a known "yes" is read
        // again first (a remembered "no" may be out of date), and a setting still unknown or unreadable is never treated
        // as "off". Declining just closes the choice.
        if (!consent.isGranted) consent.refresh()
        when (consent.statusOf()) {
            AiConsentStatus.GRANTED -> Unit
            AiConsentStatus.DENIED -> { _phase.value = SaveWordPhase.NeedsConsent; return }
            AiConsentStatus.LOADING, AiConsentStatus.UNAVAILABLE -> { _phase.value = SaveWordPhase.Failed(SavedWordError.UNAVAILABLE); return }
        }
        if (!hasSession()) { _phase.value = SaveWordPhase.Failed(SavedWordError.NOT_SIGNED_IN); return }
        // Never send what the server would refuse.
        val valid = SavedWordRules.validated(request)
        if (valid == null) { _phase.value = SaveWordPhase.Failed(SavedWordError.INVALID); return }
        try {
            _phase.value = SaveWordPhase.Saved(define(valid.word, valid.sentence, valid.course))
        } catch (e: CancellationException) {
            throw e
        } catch (e: SavedWordException) {
            if (e.error == SavedWordError.AI_CONSENT_REQUIRED) {
                // Withdrawn on another device since this sheet opened.
                consent.refresh()
                _phase.value = SaveWordPhase.NeedsConsent
            } else {
                _phase.value = SaveWordPhase.Failed(e.error)
            }
        } catch (e: IOException) {
            _phase.value = SaveWordPhase.Failed(SavedWordError.OFFLINE)
        } catch (e: UnresolvedAddressException) {
            _phase.value = SaveWordPhase.Failed(SavedWordError.OFFLINE)
        } catch (e: Exception) {
            _phase.value = SaveWordPhase.Failed(SavedWordError.UNAVAILABLE)
        }
    }

    private companion object {
        val DONE: Job = Job().also { it.complete() }
    }
}
