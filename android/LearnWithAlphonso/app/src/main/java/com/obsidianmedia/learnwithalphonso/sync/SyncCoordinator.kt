package com.obsidianmedia.learnwithalphonso.sync

import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.sync.AccountQueueRetention
import com.obsidianmedia.learnwithalphonso.core.sync.ForeignOwnerClock
import com.obsidianmedia.learnwithalphonso.core.sync.SignOutGuard
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
 * A pass is bound to the account that started it: it sends only that account's rows (rows another account left on
 * this device wait for it, and expire 30 days after it left: AccountQueueRetention). If the account changes while a
 * pass runs, what the pass already sent is still removed from the queue (those rows are the old account's and a
 * sign-out keeps them), but nothing is written to the single-account caches.
 */
class SyncCoordinator(
    private val store: SyncQueueStore,
    /**
     * A client for ONE pass of [userId]'s: its token reads and refreshes are for that account only and fail (nothing is
     * sent) once another account is signed in. The app builds it over `SessionManager.freshAccessTokenFor`.
     */
    private val client: (userId: String) -> ProgressSyncClient?,
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
    /** Releases a pass's client when the pass ends, whichever way it ends (the app's per-pass clients own an HTTP client). */
    private val closeClient: (ProgressSyncClient) -> Unit = {},
    /** When each account that kept rows here left this device; null keeps other accounts' rows without expiry (tests). */
    private val ownerClock: ForeignOwnerClock? = null,
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
        val userId = currentUserId() ?: return
        lock.withLock {
            val c = client(userId) ?: return
            _syncing.value = true
            try {
                // This account is signed in again: its kept rows are its own, not another account's waiting to expire.
                ownerClock?.forget(userId)
                // After startup a row with no owner belongs to nobody (the startup step gave the old ones to the restored
                // account or dropped them): it is removed, never sent.
                val lessons = store.pendingLessonCompletions()
                val grades = store.pendingReviewGrades()
                store.removeSyncedLessonCompletions(lessons.filter { it.ownerUserId == null })
                store.removeSyncedReviewGrades(grades.filter { it.ownerUserId == null })
                ownerClock?.let { clock ->
                    val expired = AccountQueueRetention.expiredForeignRows(userId, lessons, grades, now(), retiredAt = clock::retiredAt)
                    if (!expired.isEmpty) {
                        store.removeSyncedLessonCompletions(expired.lessons)
                        store.removeSyncedReviewGrades(expired.grades)
                    }
                }
                // Only this account's rows go out; another account's stay where they are.
                val result = SyncEngine.sync(
                    lessons.filter { it.ownerUserId == userId }, grades.filter { it.ownerUserId == userId }, c, userId, now(),
                    isCurrentAccount = { currentUserId() == userId },
                )
                // Only rows of this pass's account are in the result, so applying it is right whoever is signed in now.
                store.applySyncResult(result, now())
                if (currentUserId() != userId) return
                val progress = result.lastKnownProgress ?: runCatching { c.fetchProgress() }.getOrNull()
                if (currentUserId() != userId) return
                if (progress != null) store.updateLastKnownProgress(progress) else store.markSyncedNow()
            } finally {
                _syncing.value = false
                closeClient(c)
            }
        }
        scheduleWakeup(userId)
    }

    /**
     * The account [userId] signed out (or was switched away from). Its queued rows stay for it (see
     * [SyncQueueStore.endSession]) and their 30 days start now; an account that left nothing behind is forgotten.
     * Under the pass lock, so a pass that is still writing finishes first.
     */
    suspend fun endSession(userId: String) {
        lock.withLock {
            store.endSession(userId)
            val leftRows = store.pendingLessonCompletions().any { it.ownerUserId == userId } ||
                store.pendingReviewGrades().any { it.ownerUserId == userId }
            ownerClock?.let { if (leftRows) it.markRetired(userId, now()) else it.forget(userId) }
        }
    }

    /** The account [userId] was deleted: its queued rows and lost lessons go (see [SyncQueueStore.clearAccount]). */
    suspend fun clearAccount(userId: String) {
        lock.withLock {
            store.clearAccount(userId)
            ownerClock?.forget(userId)
        }
    }

    /**
     * Settings' "Sign out": first tries to send what [userId] has waiting, then says whether to sign out at once or ask
     * first (SignOutGuard). Signing out keeps the rows either way; the question is only so nothing is left silently.
     */
    suspend fun prepareSignOut(userId: String): SignOutGuard.Decision {
        triggerSync()
        val lessons = store.pendingLessonCompletions().count { it.ownerUserId == userId }
        val grades = store.pendingReviewGrades().count { it.ownerUserId == userId }
        return SignOutGuard.decide(lessons, grades)
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
