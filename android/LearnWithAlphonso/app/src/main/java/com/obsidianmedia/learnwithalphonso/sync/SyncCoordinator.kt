package com.obsidianmedia.learnwithalphonso.sync

import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.sync.SyncEngine
import com.obsidianmedia.learnwithalphonso.data.SyncQueueStore
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Port of RootView.triggerSync: drains the offline queue on launch,
 * foreground and connectivity regain, then keeps the cached header fresh.
 * When nothing was pushed, the server is read directly, because otherwise
 * a reinstalled app shows an empty header forever (the exact bug a tester
 * reported on iOS).
 */
class SyncCoordinator(
    private val store: SyncQueueStore,
    private val client: () -> ProgressSyncClient?,
) {
    private val lock = Mutex()

    suspend fun triggerSync() = lock.withLock {
        val c = client() ?: return
        val result = SyncEngine.sync(store.pendingLessonCompletions(), store.pendingReviewGrades(), c)
        store.removeSyncedLessonCompletions(result.syncedLessonCompletions)
        store.removeSyncedReviewGrades(result.syncedReviewGrades)
        val progress = result.lastKnownProgress ?: runCatching { c.fetchProgress() }.getOrNull()
        if (progress != null) store.updateLastKnownProgress(progress) else store.markSyncedNow()
    }
}
