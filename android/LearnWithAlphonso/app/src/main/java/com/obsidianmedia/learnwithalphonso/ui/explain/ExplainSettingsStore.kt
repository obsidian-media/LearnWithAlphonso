package com.obsidianmedia.learnwithalphonso.ui.explain

import com.obsidianmedia.learnwithalphonso.core.firstrun.LearnerAnswers
import com.obsidianmedia.learnwithalphonso.core.firstrun.LearnerProfile
import com.obsidianmedia.learnwithalphonso.core.logic.ExplainMode
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * The learner's "Explain in my language" settings: their native language (first run, or changed in Settings) and how
 * they want help. Both live in the learner profile on the account (`user_metadata.learner_profile`), so they follow the
 * learner between web, iPhone and Android. Held for the process; read again after a few minutes, on a new account, and
 * whenever Settings opens. Until a read has landed nothing is offered, so a screen never flashes a chip it then removes.
 */
class ExplainSettingsStore(
    private val fetch: suspend () -> LearnerProfile,
    private val save: suspend (LearnerAnswers) -> LearnerProfile,
    private val userId: () -> String?,
    private val now: () -> Long = System::currentTimeMillis,
) {
    data class State(val loaded: Boolean = false, val nativeLanguage: String? = null, val mode: ExplainMode = ExplainMode.DEFAULT)

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private val lock = Mutex()
    private var loadedFor: String? = null
    private var loadedAt = 0L

    /** Reads the profile when it has not been read for this account lately. A failure leaves things as they were. */
    suspend fun ensureLoaded(force: Boolean = false) {
        val id = userId() ?: run { _state.value = State(); loadedFor = null; return }
        lock.withLock {
            if (!force && loadedFor == id && now() - loadedAt < FRESH_MS) return
            try {
                apply(id, fetch())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // Offline or refused: keep what we have for this account, or nothing for another one.
                if (loadedFor != id) _state.value = State()
            }
        }
    }

    /** Saves a change and shows it at once. Throws when the save failed, leaving the old values. */
    suspend fun update(nativeLanguage: String? = null, mode: ExplainMode? = null) {
        val id = userId() ?: return
        val saved = save(LearnerAnswers(nativeLanguage = nativeLanguage, explainMode = mode?.wire))
        lock.withLock { apply(id, saved) }
    }

    private fun apply(id: String, profile: LearnerProfile) {
        loadedFor = id
        loadedAt = now()
        _state.value = State(true, profile.answers.nativeLanguage, ExplainMode.parse(profile.answers.explainMode))
    }

    private companion object {
        const val FRESH_MS = 5 * 60_000L
    }
}
