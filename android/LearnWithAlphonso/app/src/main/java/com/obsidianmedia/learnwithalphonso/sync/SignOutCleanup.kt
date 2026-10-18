package com.obsidianmedia.learnwithalphonso.sync

import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch

/**
 * Clears what belongs to an account when that account ends, whichever way it happens: the Settings button, a refresh token
 * the server rejects in the background, account deletion, a switch to another account. It runs in the app's own scope,
 * so it does not depend on a screen being composed and is not cancelled when one leaves; a [SignOutWatcher] keeps the
 * launch before the session is restored from counting. One failing clear is logged and the next change is still seen:
 * it must not end the collector or crash the app.
 */
class SignOutCleanup(scope: CoroutineScope, signedInUserIds: Flow<String?>, clear: suspend (endedUserId: String) -> Unit) {
    init {
        scope.launch {
            val watcher = SignOutWatcher()
            signedInUserIds.collect { userId ->
                val ended = watcher.endedAccount(userId) ?: return@collect
                try {
                    clear(ended)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w("SignOutCleanup", "Clearing the ended account's data failed", e)
                }
            }
        }
    }
}
