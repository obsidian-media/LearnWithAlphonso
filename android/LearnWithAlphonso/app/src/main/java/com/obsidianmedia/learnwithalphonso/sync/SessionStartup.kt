package com.obsidianmedia.learnwithalphonso.sync

import com.obsidianmedia.learnwithalphonso.core.sync.AccountQueueRetention
import com.obsidianmedia.learnwithalphonso.core.sync.ForeignOwnerClock
import com.obsidianmedia.learnwithalphonso.data.SyncQueueStore
import kotlinx.coroutines.CompletableDeferred

/**
 * The launch sequence the first sync pass waits for: restore the session, then settle what the store holds against it.
 *
 * - Nobody restored (never signed in, or the refresh token was rejected, or the process died after a sign-out before it
 *   could clear): the single-account caches are cleared, so the next account never sees the previous account's cached
 *   progress or due cards. Queued work stays with the account that played it (AccountQueueRetention).
 * - Someone restored: rows queued before owners were recorded go to them (once), or are dropped.
 * - Any other account's kept rows with no recorded departure (a sign-out the process died in) start their 30 days now.
 *
 * [startup] is completed in every case, so a failure here never leaves sync waiting for ever.
 */
class SessionStartup(
    private val restore: suspend () -> Unit,
    private val restoredUserId: () -> String?,
    private val store: SyncQueueStore,
    private val startup: CompletableDeferred<Unit>,
    private val ownerClock: ForeignOwnerClock? = null,
    private val now: () -> Long = System::currentTimeMillis,
) {
    suspend fun run() {
        try {
            restore()
            val userId = restoredUserId()
            runCatching {
                if (userId == null) store.clearCaches()
                store.resolveOrphanedRows(userId)
                ownerClock?.let { clock ->
                    AccountQueueRetention.ownersWithoutDeparture(userId, store.pendingLessonCompletions(), store.pendingReviewGrades(), clock::retiredAt)
                        .forEach { clock.markRetiredIfUnknown(it, now()) }
                }
            }
        } finally {
            startup.complete(Unit)
        }
    }
}
