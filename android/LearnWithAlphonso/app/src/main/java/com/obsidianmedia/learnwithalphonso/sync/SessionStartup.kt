package com.obsidianmedia.learnwithalphonso.sync

import com.obsidianmedia.learnwithalphonso.data.SyncQueueStore
import kotlinx.coroutines.CompletableDeferred

/**
 * The launch sequence the first sync pass waits for: restore the session, then settle what the store holds against it.
 *
 * - Nobody restored (never signed in, or the refresh token was rejected, or the process died after a sign-out before it
 *   could clear): the store is cleared, so the next account never sees the previous account's cached progress, due cards
 *   or queued work.
 * - Someone restored: rows queued before owners were recorded go to them (once), or are dropped.
 *
 * [startup] is completed in every case, so a failure here never leaves sync waiting for ever.
 */
class SessionStartup(
    private val restore: suspend () -> Unit,
    private val restoredUserId: () -> String?,
    private val store: SyncQueueStore,
    private val startup: CompletableDeferred<Unit>,
) {
    suspend fun run() {
        try {
            restore()
            val userId = restoredUserId()
            runCatching {
                if (userId == null) store.clearAll()
                store.resolveOrphanedRows(userId)
            }
        } finally {
            startup.complete(Unit)
        }
    }
}
