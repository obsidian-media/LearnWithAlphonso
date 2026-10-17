package com.obsidianmedia.learnwithalphonso.sync

import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.sync.SyncEngine
import com.obsidianmedia.learnwithalphonso.core.sync.SyncWakeup
import com.obsidianmedia.learnwithalphonso.core.sync.sync
import com.obsidianmedia.learnwithalphonso.data.SyncQueueStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Port of RootView.triggerSync: drains the offline queue on launch, foreground and connectivity regain, then keeps the
 * cached header fresh. When nothing was pushed, the server is read directly, because otherwise a reinstalled app shows
 * an empty header forever (the exact bug a tester reported on iOS).
 *
 * After a pass it also wakes itself when the next queued item becomes due (RootView's retry task): backoff delays an
 * item, and without a timer it would wait for the next foreground or reconnect. The 30 second floor is what stops a
 * loop: an item that is due but cannot be sent yet would otherwise start a new pass the moment the last one ended.
 */
class SyncCoordinator(
    private val store: SyncQueueStore,
    private val client: () -> ProgressSyncClient?,
    private val currentUserId: () -> String? = { null },
    private val isConnected: () -> Boolean = { true },
    private val scope: CoroutineScope? = null,
    private val now: () -> Long = System::currentTimeMillis,
    /** How long to sleep for an item due at the first argument; the floor keeps a loop from starting. Tests shorten it. */
    private val wakeupDelayMillis: (dueAtMillis: Long, nowMillis: Long) -> Long = SyncWakeup::delayMillis,
) {
    private val lock = Mutex()
    private var wakeup: Job? = null

    private val _syncing = MutableStateFlow(false)

    /** True while a pass runs, for the Learn tab's "Sync now" button. */
    val syncing: StateFlow<Boolean> = _syncing.asStateFlow()

    suspend fun triggerSync() {
        val userId = currentUserId()
        lock.withLock {
            val c = client() ?: return
            _syncing.value = true
            try {
                userId?.let { store.adoptOrphanedRows(it) }
                val result = SyncEngine.sync(store.pendingLessonCompletions(), store.pendingReviewGrades(), c, userId, now())
                store.applySyncResult(result, now())
                val progress = result.lastKnownProgress ?: runCatching { c.fetchProgress() }.getOrNull()
                if (progress != null) store.updateLastKnownProgress(progress) else store.markSyncedNow()
            } finally {
                _syncing.value = false
            }
        }
        scheduleWakeup(userId)
    }

    /** The Learn tab's "Sync now": a pass that survives the screen. */
    fun syncNow() {
        scope?.launch { triggerSync() }
    }

    /** Sleeps until the next queued item is due, then runs a pass if the same account is still signed in and online. */
    internal suspend fun scheduleWakeup(userId: String?) {
        wakeup?.cancel()
        wakeup = null
        val s = scope ?: return
        if (userId == null) return
        val due = SyncWakeup.nextPendingAttempt(userId, store.pendingLessonCompletions(), store.pendingReviewGrades(), now()) ?: return
        wakeup = s.launch {
            delay(wakeupDelayMillis(due, now()))
            if (currentUserId() == userId && isConnected()) triggerSync()
        }
    }
}
