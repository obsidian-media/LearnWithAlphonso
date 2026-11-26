package com.obsidianmedia.learnwithalphonso.push

import android.content.SharedPreferences
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.registerDeviceToken
import com.obsidianmedia.learnwithalphonso.core.net.unregisterDeviceToken
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Port of RemotePushRegistrar.swift over FCM. Uploads this device's token
 * only after the notification permission was granted and while signed in
 * (spec section 8), remembers the last uploaded token so a launch does not
 * re-upload the same one, and deletes the row on sign-out.
 */
class PushRegistrar(
    private val tokenSource: suspend () -> String?,
    private val permissionGranted: () -> Boolean,
    private val isSignedIn: () -> Boolean,
    private val client: () -> ProgressSyncClient?,
    private val prefs: SharedPreferences,
    private val scope: CoroutineScope,
    /**
     * Where a failure goes: [stage] is "token" (Firebase gave no token) or "upload" (the server refused or could not
     * be reached). Registration is retried on every launch, so this is for seeing a device that never registers, not
     * for the learner. The app wires it to the log and the crash reporter (scrubbed, release builds only).
     */
    private val onFailure: (stage: String, error: Throwable) -> Unit = { _, _ -> },
    /**
     * Waits between the in-process retries of a failed upload (bounded: one try per entry). The failed token is also
     * kept as pending, so the next launch or foreground retries it even if every wait here ended in failure.
     */
    private val retryDelaysMs: List<Long> = emptyList(),
    private val pause: suspend (Long) -> Unit = { kotlinx.coroutines.delay(it) },
) {
    private var retryJob: kotlinx.coroutines.Job? = null

    /** Every signed-in launch and foreground; cheap and idempotent. */
    suspend fun registerIfAuthorized() {
        if (!permissionGranted() || !isSignedIn()) return
        // A null token with no exception is a build without Firebase, not a failure.
        val token = runCatching { tokenSource() }.onFailure { reportFailure("token", it) }.getOrNull() ?: return
        upload(token)
        // A token that failed to upload before is the same token the source returns now; nothing else to do.
    }

    /** FirebaseMessagingService.onNewToken: a rotated token replaces the old row on the next upload. */
    fun onNewToken(token: String) {
        scope.launch { if (permissionGranted() && isSignedIn()) upload(token) }
    }

    /** Before the session is cleared, so the client still carries a token to authorise the delete. */
    fun onSignOut() {
        val token = prefs.getString(UPLOADED_KEY, null) ?: return
        val c = client() ?: return
        prefs.edit().remove(UPLOADED_KEY).remove(PENDING_KEY).apply()
        retryJob?.cancel()
        scope.launch { runCatching { c.unregisterDeviceToken(token) } }
    }

    private suspend fun upload(token: String) {
        if (prefs.getString(UPLOADED_KEY, null) == token) return
        val c = client() ?: return
        val done = tryUpload(c, token)
        if (!done) scheduleRetry(token)
    }

    private suspend fun tryUpload(c: ProgressSyncClient, token: String): Boolean =
        runCatching { c.registerDeviceToken(token) }
            .onSuccess { prefs.edit().putString(UPLOADED_KEY, token).remove(PENDING_KEY).apply() }
            .onFailure {
                // Recorded as pending (the token only, never logged) so a later launch retries it too.
                prefs.edit().putString(PENDING_KEY, token).apply()
                reportFailure("upload", it)
            }
            .isSuccess

    /** One bounded retry loop at a time; it stops at the first success, on sign-out, or when the waits run out. */
    private fun scheduleRetry(token: String) {
        if (retryDelaysMs.isEmpty() || retryJob?.isActive == true) return
        retryJob = scope.launch {
            for (wait in retryDelaysMs) {
                pause(wait)
                if (!permissionGranted() || !isSignedIn()) return@launch
                if (prefs.getString(UPLOADED_KEY, null) == token) return@launch
                val c = client() ?: return@launch
                if (tryUpload(c, token)) return@launch
            }
        }
    }

    /** A cancelled coroutine is not a registration failure; everything else is reported, and reporting never throws. */
    private fun reportFailure(stage: String, error: Throwable) {
        if (error is kotlinx.coroutines.CancellationException) return
        runCatching { onFailure(stage, error) }
    }

    companion object {
        const val UPLOADED_KEY = "uploadedPushToken"
        /** A token whose upload failed and is still to be retried. */
        const val PENDING_KEY = "pendingPushToken"
    }
}
