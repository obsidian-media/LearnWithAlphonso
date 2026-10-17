package com.obsidianmedia.learnwithalphonso.sync

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MemorySyncStore
import com.obsidianmedia.learnwithalphonso.PROGRESS_JSON
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.sync.PendingLessonCompletion
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

class SyncCoordinatorTest {
    private val now = 1_758_000_000_000L
    private val done = """{"xpGain":50,"newlyUnlocked":[],"heartsBonus":null,"progress":$PROGRESS_JSON}"""

    private fun row(owner: String? = "u1") = PendingLessonCompletion("u1l1", 5, emptyList(), "en", now - 1000, 50, ownerUserId = owner)

    private fun server(failFirst: Int, hold: CompletableDeferred<Unit>? = null) = AtomicInteger(0).let { completes ->
        FakeServer { req ->
            when {
                req.path.endsWith("start-lesson-session") -> json("""{"token":"tok"}""")
                req.path.endsWith("complete-lesson") -> {
                    hold?.await()
                    if (completes.incrementAndGet() <= failFirst) json("""{"error":"overloaded"}""", HttpStatusCode.ServiceUnavailable) else json(done)
                }
                else -> json("[]")
            }
        }
    }

    private fun completes(s: FakeServer) = s.seen.count { it.path.endsWith("complete-lesson") }

    private fun scope() = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Test
    fun `a failed pass wakes itself when the item becomes due, and stops once it is synced`() = runBlocking {
        val s = server(failFirst = 1)
        val store = MemorySyncStore().apply { completions.add(row()) }
        var clock = now
        // The timer's job is to sleep until the item is due: here the clock jumps to that moment and the sleep is short.
        val coordinator = SyncCoordinator(store, { s.progressClient }, { "u1" }, { true }, scope(), { clock }, wakeupDelayMillis = { due, _ -> clock = due; 20 })
        coordinator.triggerSync()
        assertEquals("the first pass failed and rescheduled the row", 1, store.completions.single().attemptCount)
        awaitTrue("the wake-up ran a second pass") { store.completions.isEmpty() }
        assertEquals(2, completes(s))
    }

    @Test
    fun `the wake-up keeps re-arming itself while the server stays down`() = runBlocking {
        // Three failed passes in a row, each started by the previous wake-up: a wake-up that cancelled the pass it
        // started (it ran the pass inside its own timer job) would stop after the second.
        val s = server(failFirst = 3)
        val store = MemorySyncStore().apply { completions.add(row()) }
        var clock = now
        val coordinator = SyncCoordinator(store, { s.progressClient }, { "u1" }, { true }, scope(), { clock }, wakeupDelayMillis = { due, _ -> clock = due; 20 })
        coordinator.triggerSync()
        awaitTrue("synced after three failures") { store.completions.isEmpty() }
        assertEquals(4, completes(s))
    }

    @Test
    fun `no wake-up while offline, for another account, or with nothing queued`() = runBlocking {
        val offline = server(failFirst = 1)
        val store = MemorySyncStore().apply { completions.add(row()) }
        var connected = false
        var user: String? = "u1"
        val coordinator = SyncCoordinator(store, { offline.progressClient }, { user }, { connected }, scope(), { now }, wakeupDelayMillis = { _, _ -> 20 })
        coordinator.triggerSync()
        delay(200)
        assertEquals("offline: the wake-up waits for the reconnect trigger", 1, completes(offline))

        val s2 = server(failFirst = 1)
        val store2 = MemorySyncStore().apply { completions.add(row()) }
        connected = true
        val c2 = SyncCoordinator(store2, { s2.progressClient }, { user }, { connected }, scope(), { now }, wakeupDelayMillis = { _, _ -> 150 })
        c2.triggerSync()
        user = "u2" // signed out and in as someone else before the wake-up fires
        delay(400)
        assertEquals("another account's session is never synced by an old timer", 1, completes(s2))

        val idle = server(0)
        val empty = SyncCoordinator(MemorySyncStore(), { idle.progressClient }, { "u1" }, { true }, scope(), { now }, wakeupDelayMillis = { _, _ -> 20 })
        empty.triggerSync()
        val afterFirstPass = idle.seen.size
        delay(300)
        assertEquals("nothing queued: no timer, no second pass", afterFirstPass, idle.seen.size)
    }

    @Test
    fun `coming back online starts a pass, staying online or starting online does not`() = runBlocking {
        val s = server(failFirst = 0)
        val store = MemorySyncStore().apply { completions.add(row()) }
        val connected = MutableStateFlow(false)
        // A long wake-up delay: only the reconnect can start a pass here.
        val coordinator = SyncCoordinator(store, { s.progressClient }, { "u1" }, { connected.value }, scope(), { now }, wakeupDelayMillis = { _, _ -> 600_000 })
        coordinator.start(connected)
        delay(200)
        assertEquals("offline: nothing to do yet", 0, completes(s))
        connected.value = true
        awaitTrue("the reconnect drained the queue") { store.completions.isEmpty() }
        assertEquals(1, completes(s))

        val s2 = server(failFirst = 0)
        val store2 = MemorySyncStore().apply { completions.add(row()) }
        val alwaysOn = MutableStateFlow(true)
        SyncCoordinator(store2, { s2.progressClient }, { "u1" }, { true }, scope(), { now }, wakeupDelayMillis = { _, _ -> 600_000 }).start(alwaysOn)
        alwaysOn.value = true
        delay(300)
        assertEquals("launching online is the launch sync's job, not a reconnect", 0, completes(s2))
    }

    @Test
    fun `queueing work arms the wake-up without waiting for a foreground or a reconnect`() = runBlocking {
        val s = server(failFirst = 0)
        val store = MemorySyncStore()
        val coordinator = SyncCoordinator(store, { s.progressClient }, { "u1" }, { true }, scope(), { now }, wakeupDelayMillis = { _, _ -> 20 })
        coordinator.start(MutableStateFlow(true))
        delay(150)
        assertEquals(0, completes(s))
        store.appendLessonCompletion(row())
        awaitTrue("the queued lesson was picked up") { store.completions.isEmpty() }
        assertEquals(1, completes(s))
    }

    @Test
    fun `rows without an owner are adopted by the first account that syncs, foreign rows are dropped unsent`() = runBlocking {
        val s = server(failFirst = 0)
        val store = MemorySyncStore().apply {
            completions.add(row(owner = null))
            completions.add(PendingLessonCompletion("theirs", 5, emptyList(), "en", now - 500, 50, ownerUserId = "u2"))
        }
        SyncCoordinator(store, { s.progressClient }, { "u1" }, { true }, null, { now }).triggerSync()
        assertTrue(store.completions.isEmpty())
        assertEquals("only the adopted row was sent", 1, completes(s))
        assertTrue(s.seen.none { it.body.contains("theirs") })
    }

    @Test
    fun `ownerless rows are adopted once, then dropped unsent so they can never move to another account`() = runBlocking {
        val s = server(failFirst = 0)
        val store = MemorySyncStore().apply {
            orphansResolved = true // the first launch after the upgrade already happened
            completions.add(row(owner = null))
        }
        SyncCoordinator(store, { s.progressClient }, { "u2" }, { true }, null, { now }).triggerSync()
        assertTrue(store.completions.isEmpty())
        assertEquals("an ownerless row found later belongs to nobody and is never sent", 0, completes(s))
    }

    @Test
    fun `an adopted row belongs to the adopting account from then on, even when it stays queued`() = runBlocking {
        val s = server(failFirst = 5)
        val store = MemorySyncStore().apply { completions.add(row(owner = null)) }
        SyncCoordinator(store, { s.progressClient }, { "u1" }, { true }, null, { now }).triggerSync()
        val kept = store.completions.single()
        assertEquals("u1", kept.ownerUserId)
        assertEquals(1, kept.attemptCount)
    }

    @Test
    fun `a pass that ends after the account changed writes nothing back`() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val s = server(failFirst = 0, hold = gate)
        val store = MemorySyncStore().apply { completions.add(row()) }
        var user = "u1"
        val coordinator = SyncCoordinator(store, { s.progressClient }, { user }, { true }, null, { now })
        val pass = async(Dispatchers.Default) { coordinator.triggerSync() }
        awaitTrue("the request is in flight") { s.seen.any { it.path.endsWith("complete-lesson") } }
        user = "u2" // signed out and in as someone else while the request was out
        gate.complete(Unit)
        pass.await()
        assertEquals("the result belongs to the previous account: nothing is applied", 1, store.completions.size)
        assertNull("and no progress is stored under the new account", store.syncedAt)
    }

    @Test
    fun `a rejected lesson is dead-lettered with its reason and owner, and leaves the queue`() = runBlocking {
        val s = FakeServer { req ->
            when {
                req.path.endsWith("start-lesson-session") -> json("""{"token":"tok"}""")
                else -> json("""{"error":"lesson-version-mismatch"}""", HttpStatusCode.Conflict)
            }
        }
        val store = MemorySyncStore().apply { completions.add(row()) }
        SyncCoordinator(store, { s.progressClient }, { "u1" }, { true }, null, { now }).triggerSync()
        assertTrue(store.completions.isEmpty())
        assertEquals("lesson-version-mismatch", store.deadRows.single().reason)
        assertEquals(row().queueIdentity, store.deadRows.single().identity)
        assertEquals("u1", store.deadRows.single().ownerUserId)
    }

    @Test
    fun `the syncing flag is true while a pass runs and false after`() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val s = server(failFirst = 0, hold = gate)
        val store = MemorySyncStore().apply { completions.add(row()) }
        val coordinator = SyncCoordinator(store, { s.progressClient }, { "u1" }, { true }, null, { now })
        assertFalse(coordinator.syncing.value)
        val pass = async(Dispatchers.Default) { coordinator.triggerSync() }
        awaitTrue("syncing while the request is out") { coordinator.syncing.value }
        gate.complete(Unit)
        pass.await()
        assertFalse(coordinator.syncing.value)
        assertTrue(store.completions.isEmpty())
    }

    @Test
    fun `only a real sign-out clears the queue, not the launch before the session is restored`() {
        val watcher = SignOutWatcher()
        assertFalse("cold launch: nobody signed in yet", watcher.signedOut(null))
        assertFalse("the session was restored", watcher.signedOut("u1"))
        assertTrue("u1 signed out", watcher.signedOut(null))
        assertFalse("still signed out", watcher.signedOut(null))
        assertFalse(watcher.signedOut("u2"))
    }
}
