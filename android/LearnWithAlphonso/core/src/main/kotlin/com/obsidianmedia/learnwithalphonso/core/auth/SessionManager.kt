package com.obsidianmedia.learnwithalphonso.core.auth

import com.obsidianmedia.learnwithalphonso.core.logic.AuthUserNames
import com.obsidianmedia.learnwithalphonso.core.net.OAuthPkce
import com.obsidianmedia.learnwithalphonso.core.net.PkceChallenge
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseAuthClient
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseAuthError
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseSession
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Where the session lives between launches. The app implements it over EncryptedSharedPreferences. */
interface SessionStore {
    fun load(): SupabaseSession?
    fun save(session: SupabaseSession)
    fun clear()
}

sealed interface AuthState {
    data object SignedOut : AuthState
    data class AwaitingCode(val email: String) : AuthState
    data class SignedIn(val session: SupabaseSession) : AuthState
}

/**
 * Port of Session.swift: app-wide auth state, the one place a session is
 * established, and the token-refresh policy every client shares.
 * Pure Kotlin so the state machine is unit-tested on the JVM.
 */
/** A request was about to be made for one account while another (or none) is signed in: it is not sent. */
class AccountChangedException : java.io.IOException("The signed-in account changed")

class SessionManager(
    private val auth: SupabaseAuthClient,
    private val store: SessionStore,
    private val nowSeconds: () -> Long = { System.currentTimeMillis() / 1000 },
) {
    private val _state = MutableStateFlow<AuthState>(AuthState.SignedOut)
    val state: StateFlow<AuthState> = _state.asStateFlow()

    private val _isRestoring = MutableStateFlow(true)
    val isRestoring: StateFlow<Boolean> = _isRestoring.asStateFlow()

    private val _isBusy = MutableStateFlow(false)
    val isBusy: StateFlow<Boolean> = _isBusy.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _notice = MutableStateFlow<String?>(null)
    val notice: StateFlow<String?> = _notice.asStateFlow()

    private val refreshLock = Mutex()
    private var pendingPkce: PkceChallenge? = null

    val userId: String? get() = (_state.value as? AuthState.SignedIn)?.session?.userId

    /** The current token without refreshing; SupabaseHttp's 401 retry calls freshAccessToken(force = true). */
    fun currentAccessToken(): String? = (_state.value as? AuthState.SignedIn)?.session?.accessToken

    /** The names in the signed-in account's auth record, or null when unreadable (the prompt then just has no prefill). */
    suspend fun fetchUserNames(): AuthUserNames? {
        val token = freshAccessToken() ?: return null
        return runCatching { auth.fetchUserNames(token) }.getOrNull()
    }

    /**
     * A token valid right now, refreshing when within 60 seconds of expiry
     * or when forced. Null means signed out or unable to refresh right now.
     * Only a refresh token the server rejects ends the session (Session.swift,
     * 2026-09-29 audit); being offline or rate-limited used to sign the
     * learner out too, which this port had copied before that fix.
     */
    suspend fun freshAccessToken(force: Boolean = false): String? = refreshLock.withLock { freshLocked(currentSession(), force) }

    private fun currentSession(): SupabaseSession? = (_state.value as? AuthState.SignedIn)?.session

    /**
     * Like [freshAccessToken], for work that belongs to ONE account (a sync pass). The account is checked inside the
     * refresh lock, so the token handed back is always that account's, and a refresh (including the HTTP seam's retry
     * after a 401) can never mint or return another account's token for a request that carries this account's data.
     * Throws [AccountChangedException] when a different account (or none) is signed in, which the HTTP layer surfaces
     * as a failed request: nothing is sent.
     */
    suspend fun freshAccessTokenFor(userId: String, force: Boolean = false): String? = refreshLock.withLock {
        // Read once: the session checked is the session used.
        val current = currentSession()
        if (current?.userId != userId) throw AccountChangedException()
        freshLocked(current, force)
    }

    /** Must be called with [refreshLock] held; `current` is the one session read for this call. */
    private suspend fun freshLocked(current: SupabaseSession?, force: Boolean): String? {
        if (current == null) return null
        if (!force && current.expiresAtEpochSeconds > nowSeconds() + 60) return current.accessToken
        return try {
            val refreshed = auth.refresh(current)
            // The refresh took a while on the network. If a different account (or none) is signed in now, its result is for
            // the account that left: storing it would put that account's session over the new one's, and its token must not
            // be handed to a request for anyone else.
            if (currentSession()?.userId != current.userId) return null
            establish(refreshed)
            refreshed.accessToken
        } catch (e: Exception) {
            // A rejected refresh token ends the session it belonged to, not whichever session is signed in by now.
            if (isRejectedRefreshToken(e) && currentSession()?.userId == current.userId) signOut()
            null
        }
    }

    /** 400/401/403 from GoTrue's token endpoint mean the refresh token is invalid, revoked or used; anything else is transient. */
    private fun isRejectedRefreshToken(e: Exception): Boolean = e is SupabaseAuthError.Server && e.status in setOf(400, 401, 403)

    /** Cold-launch restore: a stored session still valid is used, an expired one refreshed, a failed refresh cleared. */
    suspend fun restore() {
        try {
            val stored = store.load() ?: return
            if (stored.expiresAtEpochSeconds > nowSeconds() + 60) {
                establish(stored)
                return
            }
            try {
                establish(auth.refresh(stored))
            } catch (e: Exception) {
                // Offline or a server hiccup at launch: stay signed in on the stored
                // session and let the next request's 401 retry refresh it. Clearing
                // here signed a learner out just for opening the app in airplane mode.
                if (isRejectedRefreshToken(e)) store.clear() else establish(stored)
            }
        } finally {
            _isRestoring.value = false
        }
    }

    suspend fun requestCode(email: String) = busy {
        auth.requestEmailOtp(email.trim())
        _state.value = AuthState.AwaitingCode(email.trim())
    }

    suspend fun verifyCode(code: String) {
        val email = (_state.value as? AuthState.AwaitingCode)?.email ?: return
        busy { establish(auth.verifyEmailOtp(email, code.trim())) }
    }

    fun backToEmail() {
        if (_state.value is AuthState.AwaitingCode) _state.value = AuthState.SignedOut
        _errorMessage.value = null
    }

    suspend fun signInWithPassword(email: String, password: String) = busy {
        establish(auth.signInWithPassword(email.trim(), password))
    }

    suspend fun signUpWithPassword(email: String, password: String, displayName: String, emailRedirectTo: String) = busy {
        val name = displayName.trim().ifEmpty { email.trim().substringBefore('@') }.take(40)
        val session = auth.signUpWithPassword(email.trim(), password, name, emailRedirectTo)
        if (session != null) establish(session)
        else _notice.value = "Almost there: check your email and click the confirmation link to activate your account."
    }

    suspend fun resetPassword(email: String, redirectTo: String) = busy {
        auth.resetPasswordForEmail(email.trim(), redirectTo)
        _notice.value = "If an account exists for that address, we've sent a link to reset your password. Check your inbox."
    }

    /** Builds the Supabase PKCE authorize URL for the Custom Tab and remembers the verifier for the callback. */
    fun beginGoogleSignIn(supabaseUrl: String, redirectTo: String): String {
        _errorMessage.value = null
        val challenge = OAuthPkce.make()
        pendingPkce = challenge
        return OAuthPkce.authorizeUrl(supabaseUrl, redirectTo, challenge)
    }

    suspend fun completeGoogleSignIn(callbackUri: String) {
        val challenge = pendingPkce ?: return
        val code = OAuthPkce.authorizationCode(callbackUri)
        if (code == null) {
            _errorMessage.value = "Google sign-in didn't complete. Please try again."
            return
        }
        busy {
            establish(auth.exchangeOAuthCode(code, challenge.verifier))
            pendingPkce = null
        }
    }

    fun signOut() {
        _state.value = AuthState.SignedOut
        _errorMessage.value = null
        store.clear()
    }

    fun clearMessages() {
        _errorMessage.value = null
        _notice.value = null
    }

    private fun establish(session: SupabaseSession) {
        _state.value = AuthState.SignedIn(session)
        store.save(session)
    }

    private suspend fun busy(block: suspend () -> Unit) {
        _errorMessage.value = null
        _notice.value = null
        _isBusy.value = true
        try {
            block()
        } catch (e: SupabaseAuthError.Server) {
            _errorMessage.value = e.serverMessage ?: "Something went wrong. Please try again."
        } catch (e: SupabaseAuthError) {
            _errorMessage.value = "Something went wrong. Please try again."
        } catch (e: Exception) {
            _errorMessage.value = "Couldn't connect. Check your internet connection and try again."
        } finally {
            _isBusy.value = false
        }
    }
}
