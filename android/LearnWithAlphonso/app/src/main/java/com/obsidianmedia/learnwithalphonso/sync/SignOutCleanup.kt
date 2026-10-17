package com.obsidianmedia.learnwithalphonso.sync

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch

/**
 * Clears what belongs to the signed-in account when that account signs out, whichever way it happens: the Settings
 * button, a refresh token the server rejects in the background, account deletion. It runs in the app's own scope, so
 * it does not depend on a screen being composed and is not cancelled when one leaves; a [SignOutWatcher] keeps the
 * launch before the session is restored from counting as a sign-out.
 */
class SignOutCleanup(scope: CoroutineScope, signedInUserIds: Flow<String?>, clear: suspend () -> Unit) {
    init {
        scope.launch {
            val watcher = SignOutWatcher()
            signedInUserIds.collect { userId -> if (watcher.signedOut(userId)) clear() }
        }
    }
}
