package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.concurrent.atomic.AtomicInteger

class AiConsentSignedOutException : Exception("Not signed in")

class AiConsentUnexpectedResponseException : Exception("The server did not return a consent timestamp")

/** Where the account's consent lives: the `get_ai_consent` / `set_ai_consent` RPCs. Tests use a fake. */
interface AiConsentBackend {
    fun currentUserId(): String?

    /** The stored consent timestamp, or null when the account has not allowed AI. */
    suspend fun fetch(): String?

    /** Returns the stored timestamp (null after a withdrawal). */
    suspend fun set(granted: Boolean): String?
}

/** A per-account copy of the last answer, used when the server cannot be reached. `grantedAt == null` means "denied". */
data class CachedAiConsent(val grantedAt: String?)

interface AiConsentCache {
    fun read(userId: String): CachedAiConsent?
    fun write(userId: String, grantedAt: String?)
}

/**
 * The learner's AI consent, from the ACCOUNT (`profiles.ai_consent_at`), so a choice made on the web or iOS counts
 * here and a withdrawal anywhere counts everywhere. The local cache is only a per-account fallback for when the
 * server cannot be reached. Port of AIConsentStore.swift.
 *
 * A device-wide "Got it" acknowledgement from before this existed is deliberately NOT carried over to the account:
 * it was a forced acknowledgement, not an Allow choice naming the providers, so everyone is asked once.
 */
class AiConsentStore(private val backend: AiConsentBackend, private val cache: AiConsentCache) {
    data class State(
        val loadedUserId: String? = null,
        val grantedAt: String? = null,
        val isResolved: Boolean = false,
        val lastRefreshFailed: Boolean = false,
    )

    private val _state = MutableStateFlow(initialState())
    val state: StateFlow<State> = _state.asStateFlow()

    /** Bumped by every local decision (a set, a server refusal): a read that began earlier is out of date. */
    private val writeGeneration = AtomicInteger(0)

    private fun initialState(): State {
        val userId = backend.currentUserId() ?: return State()
        val cached = cache.read(userId)
        return State(loadedUserId = userId, grantedAt = cached?.grantedAt, isResolved = cached != null)
    }

    /**
     * GRANTED (also from the per-account cache while offline), UNAVAILABLE after a failed read of an account that is
     * not known to be granted, DENIED only after the server itself said no consent, else LOADING. Pass the state you
     * collected so a composable recomputes from the value it rendered.
     */
    fun statusOf(s: State = _state.value): AiConsentStatus {
        if (s.loadedUserId != backend.currentUserId()) return AiConsentStatus.LOADING
        if (s.grantedAt != null) return AiConsentStatus.GRANTED
        if (s.lastRefreshFailed) return AiConsentStatus.UNAVAILABLE
        return if (s.isResolved) AiConsentStatus.DENIED else AiConsentStatus.LOADING
    }

    /** False whenever what is held belongs to another account (or to nobody), even before the next read lands. */
    val isGranted: Boolean get() = statusOf() == AiConsentStatus.GRANTED

    suspend fun refresh() {
        val userId = backend.currentUserId()
        if (userId == null) {
            _state.value = State(loadedUserId = null, grantedAt = null, isResolved = true)
            return
        }
        if (userId != _state.value.loadedUserId) {
            val cached = cache.read(userId)
            _state.value = State(loadedUserId = userId, grantedAt = cached?.grantedAt, isResolved = cached != null)
        }
        val generation = writeGeneration.get()
        try {
            val server = backend.fetch()
            if (backend.currentUserId() != userId || generation != writeGeneration.get()) return
            apply(server, userId)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // A failure of a read that is out of date (the learner decided meanwhile, or the account changed) says
            // nothing about the current state.
            if (backend.currentUserId() != userId || generation != writeGeneration.get()) return
            _state.update { it.copy(lastRefreshFailed = true) }
        }
    }

    /** Allows or withdraws AI. Throws when the server could not be reached; nothing local changes then. */
    suspend fun set(granted: Boolean) {
        val userId = backend.currentUserId() ?: throw AiConsentSignedOutException()
        // Bumped only once the write succeeded: a read that began before it finished is out of date, while a write
        // that fails (offline) must not discard a read that is still in flight.
        val stamp = backend.set(granted)
        writeGeneration.incrementAndGet()
        if (granted && stamp == null) throw AiConsentUnexpectedResponseException()
        if (backend.currentUserId() != userId) {
            // Another account is signed in now: keep the answer for the account it was made for, show nothing.
            cache.write(userId, if (granted) stamp else null)
            return
        }
        apply(if (granted) stamp else null, userId)
    }

    /**
     * A 403 `ai-consent-required` from any AI call means the server has no consent for this account: close the gate
     * at once, then read the truth.
     */
    suspend fun serverRefusedForLackOfConsent() {
        writeGeneration.incrementAndGet()
        backend.currentUserId()?.let { apply(null, it) }
        refresh()
    }

    private fun apply(grantedAt: String?, userId: String) {
        _state.value = State(loadedUserId = userId, grantedAt = grantedAt, isResolved = true, lastRefreshFailed = false)
        cache.write(userId, grantedAt)
    }
}

/**
 * The callback the app hands `ApiHttp.onAiConsentRequired`: a 403 `ai-consent-required` from any AI call closes the
 * gate at once and re-reads the account, without any screen having to forward it.
 */
fun AiConsentStore.consentRefusalHook(scope: CoroutineScope): () -> Unit = { scope.launch { serverRefusedForLackOfConsent() } }
