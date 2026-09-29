package com.obsidianmedia.learnwithalphonso.core.auth

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

    /**
     * A token valid right now, refreshing when within 60 seconds of expiry
     * or when forced. Null means signed out, and a failed refresh signs out:
     * a shell backed by a refresh token nothing accepts would 401 forever.
     */
    suspend fun freshAccessToken(force: Boolean = false): String? = refreshLock.withLock {
        val current = (_state.value as? AuthState.SignedIn)?.session ?: return null
        if (!force && current.expiresAtEpochSeconds > nowSeconds() + 60) return current.accessToken
        try {
            val refreshed = auth.refresh(current)
            establish(refreshed)
            refreshed.accessToken
        } catch (e: Exception) {
            signOut()
            null
        }
    }

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
                store.clear()
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
