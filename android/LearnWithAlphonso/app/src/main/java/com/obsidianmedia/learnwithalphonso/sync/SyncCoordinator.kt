package com.obsidianmedia.learnwithalphonso.sync

import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.sync.SyncEngine
import com.obsidianmedia.learnwithalphonso.core.sync.SyncWakeup
import com.obsidianmedia.learnwithalphonso.core.sync.sync
import com.obsidianmedia.learnwithalphonso.data.SyncQueueStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
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
 *
 * [start] wires the two triggers that need no screen: the connection coming back (false to true), and the queue
 * changing, which re-arms the wake-up so an item queued after the last pass is not left waiting for the next foreground.
 *
 * Nothing is written back if the signed-in account changed while a pass ran: its results belong to the previous
 * account, whose data the sign-out already cleared.
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
    /**
     * Completed once the session has been restored and the ownerless rows resolved. A pass waits for it, so no pass
     * can run (and adopt nothing, or send under the wrong account) before that decision is made.
     */
    private val startup: Deferred<Unit>? = null,
) {
    private val lock = Mutex()

    /** Guards [wakeup]: two callers re-arming at once must not leave two timers running. */
    private val wakeupLock = Mutex()
    private var wakeup: Job? = null

    private val _syncing = MutableStateFlow(false)

    /** True while a pass runs, for the Learn tab's "Sync now" button. */
    val syncing: StateFlow<Boolean> = _syncing.asStateFlow()

    /** Starts the triggers that need no screen. Call once, with the connectivity the app already watches. */
    fun start(connected: Flow<Boolean>) {
        val s = scope ?: return
        s.launch {
            var was: Boolean? = null
            connected.collect { isNow ->
                // Back online after being offline: do not wait for the next foreground.
                if (was == false && isNow) s.launch { triggerSync() }
                was = isNow
            }
        }
        // Something was queued (or left the queue): arm the wake-up for it. A pass re-arms itself when it ends.
        s.launch { store.queueChanges.collect { scheduleWakeup(currentUserId()) } }
    }

    suspend fun triggerSync() {
        startup?.await()
        val userId = currentUserId()
        lock.withLock {
            val c = client() ?: return
            _syncing.value = true
            try {
                val result = SyncEngine.sync(
                    store.pendingLessonCompletions(), store.pendingReviewGrades(), c, userId, now(),
                    isCurrentAccount = { currentUserId() == userId },
                )
                if (currentUserId() != userId) return
                store.applySyncResult(result, now())
                val progress = result.lastKnownProgress ?: runCatching { c.fetchProgress() }.getOrNull()
                if (currentUserId() != userId) return
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

    /**
     * Sleeps until the next queued item is due, then runs a pass if the same account is still signed in and online.
     * The pass runs in its own job: it ends by re-arming, which cancels the previous timer, and a pass that ran inside
     * that timer would cancel itself and never re-arm.
     */
    internal suspend fun scheduleWakeup(userId: String?) = wakeupLock.withLock {
        wakeup?.cancel()
        wakeup = null
        val s = scope ?: return@withLock
        if (userId == null) return@withLock
        val due = SyncWakeup.nextPendingAttempt(userId, store.pendingLessonCompletions(), store.pendingReviewGrades(), now()) ?: return@withLock
        wakeup = s.launch {
            delay(wakeupDelayMillis(due, now()))
            if (currentUserId() == userId && isConnected()) s.launch { triggerSync() }
        }
    }
}
