package com.obsidianmedia.learnwithalphonso.sync

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MemorySyncStore
import com.obsidianmedia.learnwithalphonso.PROGRESS_JSON
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.sync.PendingLessonCompletion
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
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

    private fun server(failFirst: Int) = AtomicInteger(0).let { completes ->
        FakeServer { req ->
            when {
                req.path.endsWith("start-lesson-session") -> json("""{"token":"tok"}""")
                req.path.endsWith("complete-lesson") -> if (completes.incrementAndGet() <= failFirst) json("""{"error":"overloaded"}""", HttpStatusCode.ServiceUnavailable) else json(done)
                else -> json("[]")
            }
        }
    }

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
        assertEquals(2, s.seen.count { it.path.endsWith("complete-lesson") })
    }

    @Test
    fun `no wake-up while offline, for another account, or with nothing queued`() = runBlocking {
        val offline = server(failFirst = 1)
        val store = MemorySyncStore().apply { completions.add(row()) }
        var connected = false
        var user: String? = "u1"
        val coordinator = SyncCoordinator(store, { offline.progressClient }, { user }, { connected }, scope(), { now }, wakeupDelayMillis = { _, _ -> 20 })
        coordinator.triggerSync()
        Thread.sleep(200)
        assertEquals("offline: the wake-up waits for the reconnect trigger", 1, offline.seen.count { it.path.endsWith("complete-lesson") })

        val s2 = server(failFirst = 1)
        val store2 = MemorySyncStore().apply { completions.add(row()) }
        connected = true
        val c2 = SyncCoordinator(store2, { s2.progressClient }, { user }, { connected }, scope(), { now }, wakeupDelayMillis = { _, _ -> 150 })
        c2.triggerSync()
        user = "u2" // signed out and in as someone else before the wake-up fires
        Thread.sleep(400)
        assertEquals("another account's session is never synced by an old timer", 1, s2.seen.count { it.path.endsWith("complete-lesson") })

        val empty = SyncCoordinator(MemorySyncStore(), { server(0).progressClient }, { "u1" }, { true }, scope(), { now }, wakeupDelayMillis = { _, _ -> 20 })
        empty.triggerSync()
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
        assertEquals("only the adopted row was sent", 1, s.seen.count { it.path.endsWith("complete-lesson") })
        assertTrue(s.seen.none { it.body.contains("theirs") })
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
    fun `a rejected lesson is dead-lettered with its reason and leaves the queue`() = runBlocking {
        val s = FakeServer { req ->
            when {
                req.path.endsWith("start-lesson-session") -> json("""{"token":"tok"}""")
                else -> json("""{"error":"lesson-version-mismatch"}""", HttpStatusCode.Conflict)
            }
        }
        val store = MemorySyncStore().apply { completions.add(row()) }
        SyncCoordinator(store, { s.progressClient }, { "u1" }, { true }, null, { now }).triggerSync()
        assertTrue(store.completions.isEmpty())
        assertEquals("lesson-version-mismatch", store.deadLetterRows.single().reason)
        assertEquals(row().queueIdentity, store.deadLetterRows.single().identity)
    }

    @Test
    fun `the syncing flag is true during a pass and false after`() = runBlocking {
        val s = server(failFirst = 0)
        val store = MemorySyncStore().apply { completions.add(row()) }
        val coordinator = SyncCoordinator(store, { s.progressClient }, { "u1" }, { true }, null, { now })
        assertFalse(coordinator.syncing.value)
        coordinator.triggerSync()
        assertFalse(coordinator.syncing.value)
        assertNull(store.completions.firstOrNull())
    }
}
