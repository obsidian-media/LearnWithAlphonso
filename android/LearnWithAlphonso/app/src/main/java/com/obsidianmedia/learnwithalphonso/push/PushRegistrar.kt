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
) {
    /** Every signed-in launch and foreground; cheap and idempotent. */
    suspend fun registerIfAuthorized() {
        if (!permissionGranted() || !isSignedIn()) return
        val token = runCatching { tokenSource() }.getOrNull() ?: return
        upload(token)
    }

    /** FirebaseMessagingService.onNewToken: a rotated token replaces the old row on the next upload. */
    fun onNewToken(token: String) {
        scope.launch { if (permissionGranted() && isSignedIn()) upload(token) }
    }

    /** Before the session is cleared, so the client still carries a token to authorise the delete. */
    fun onSignOut() {
        val token = prefs.getString(UPLOADED_KEY, null) ?: return
        val c = client() ?: return
        prefs.edit().remove(UPLOADED_KEY).apply()
        scope.launch { runCatching { c.unregisterDeviceToken(token) } }
    }

    private suspend fun upload(token: String) {
        if (prefs.getString(UPLOADED_KEY, null) == token) return
        val c = client() ?: return
        runCatching { c.registerDeviceToken(token) }.onSuccess { prefs.edit().putString(UPLOADED_KEY, token).apply() }
    }

    companion object {
        const val UPLOADED_KEY = "uploadedPushToken"
    }
}
