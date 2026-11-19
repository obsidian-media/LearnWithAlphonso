package com.obsidianmedia.learnwithalphonso.sync

import com.obsidianmedia.learnwithalphonso.MemorySyncStore
import com.obsidianmedia.learnwithalphonso.PROGRESS_JSON
import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import com.obsidianmedia.learnwithalphonso.core.sync.ForeignOwnerClock
import com.obsidianmedia.learnwithalphonso.core.sync.PendingLessonCompletion
import com.obsidianmedia.learnwithalphonso.data.SyncQueueStore
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionStartupTest {
    private val sample = LessonCompletionProgress(100, 1, 1, "2026-09-18", 4, null, 0, "bronze")
    private fun row(owner: String?) = PendingLessonCompletion("u1l1", 5, emptyList(), "en", 1_000, 50, ownerUserId = owner)

    private suspend fun run(store: SyncQueueStore, restoredUser: String?, restore: suspend () -> Unit = {}): CompletableDeferred<Unit> {
        val startup = CompletableDeferred<Unit>()
        SessionStartup(restore, { restoredUser }, store, startup).run()
        return startup
    }

    @Test
    fun `with nobody restored the previous account's cache is cleared but its queued work is kept for it`() = runBlocking {
        // The refresh token was rejected at launch, or the process died after a sign-out before it could clear.
        val store = MemorySyncStore().apply {
            completions.add(row("u1"))
            updateLastKnownProgress(sample)
        }
        val startup = run(store, restoredUser = null)
        assertEquals(1, store.clearedCaches)
        assertEquals("the lesson waits for u1 to sign back in", listOf("u1"), store.completions.map { it.ownerUserId })
        assertNull(store.lastKnownProgress())
        assertTrue(startup.isCompleted)
    }

    @Test
    fun `another account's kept rows with no recorded departure start their 30 days at launch`() = runBlocking {
        // u1 signed out and the process died before its departure was written (or an older build left the rows).
        var raw: String? = null
        val clock = ForeignOwnerClock({ raw }, { raw = it })
        clock.markRetired("u3", 5L)
        val store = MemorySyncStore().apply {
            completions.add(row("u1"))
            completions.add(row("u2"))
            completions.add(row("u3"))
        }
        SessionStartup({}, { "u2" }, store, CompletableDeferred(), clock) { 9_000L }.run()
        assertEquals(9_000L, clock.retiredAt("u1"))
        assertNull("the signed-in account is not another account", clock.retiredAt("u2"))
        assertEquals("a recorded departure is not moved", 5L, clock.retiredAt("u3"))
    }

    @Test
    fun `with an account restored nothing is cleared and ownerless rows go to it`() = runBlocking {
        val store = MemorySyncStore().apply {
            completions.add(row(null))
            updateLastKnownProgress(sample)
        }
        val startup = run(store, restoredUser = "u1")
        assertEquals(0, store.clearedCaches)
        assertEquals(listOf("u1"), store.completions.map { it.ownerUserId })
        assertEquals(sample, store.lastKnownProgress())
        assertTrue(startup.isCompleted)
    }

    @Test
    fun `sync is never left waiting, whatever the store does`() = runBlocking {
        val inner = MemorySyncStore()
        val failing = object : SyncQueueStore by inner {
            override suspend fun clearCaches() = throw IllegalStateException("disk full")
            override suspend fun resolveOrphanedRows(restoredUserId: String?) = throw IllegalStateException("disk full")
        }
        val startup = run(failing, restoredUser = null)
        assertTrue(startup.isCompleted)
    }

    @Test
    fun `the session is restored before anything is settled`() = runBlocking {
        val store = MemorySyncStore().apply { completions.add(row("u1")) }
        var restored = false
        val startup = CompletableDeferred<Unit>()
        SessionStartup({ restored = true }, { if (restored) "u1" else null }, store, startup).run()
        assertEquals("a user restored by restore() is seen, so nothing is cleared", 0, store.clearedCaches)
        assertEquals(1, store.completions.size)
    }
}
