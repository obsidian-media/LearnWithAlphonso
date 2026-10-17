package com.obsidianmedia.learnwithalphonso.data

import com.obsidianmedia.learnwithalphonso.core.net.LessonCompletionProgress
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.lang.reflect.Proxy

/**
 * RoomSyncQueueStore over a recording stand-in for the DAO, so what the store decides (not what SQLite does, which the
 * instrumented SyncQueueStoreTest covers) runs on the JVM: which writes happen, and that a read-modify-write of the
 * sync-state row happens inside one transaction.
 */
class RoomSyncQueueStoreTest {
    private class Recorder {
        var inTransaction = false
        var transactions = 0
        val calls = ArrayList<String>()
        var state: AppSyncStateRecord? = null
    }

    private fun store(r: Recorder): RoomSyncQueueStore {
        val dao = Proxy.newProxyInstance(SyncDao::class.java.classLoader, arrayOf(SyncDao::class.java)) { _, method, args ->
            when (method.name) {
                "syncState" -> { r.calls.add("read:${r.inTransaction}"); r.state }
                "upsertSyncState" -> { r.calls.add("write:${r.inTransaction}"); r.state = args[0] as AppSyncStateRecord; Unit }
                else -> { r.calls.add(method.name); Unit }
            }
        } as SyncDao
        return RoomSyncQueueStore(dao, inTransaction = { block ->
            r.inTransaction = true
            r.transactions++
            try { block() } finally { r.inTransaction = false }
        }) { 5_000L }
    }

    private val progress = LessonCompletionProgress(120, 3, 5, "2026-09-14", 4, null, 1, "silver")

    @Test
    fun `reading and rewriting the sync-state row happens inside one transaction`() = runBlocking {
        val r = Recorder().apply { state = AppSyncStateRecord(orphansResolved = true) }
        val s = store(r)
        s.updateLastKnownProgress(progress)
        s.markSyncedNow()
        s.resolveOrphanedRows("u1")
        val rw = r.calls.filter { it.startsWith("read:") || it.startsWith("write:") }
        assertTrue("every read and write of the row was inside a transaction: $rw", rw.isNotEmpty() && rw.all { it.endsWith(":true") })
        assertEquals(3, r.transactions)
        assertTrue("a concurrent progress write cannot reset the flag", r.state!!.orphansResolved)
    }

    @Test
    fun `the first call after the upgrade gives ownerless rows to the restored account and records it`() = runBlocking {
        val r = Recorder()
        store(r).resolveOrphanedRows("u1")
        assertTrue(r.calls.containsAll(listOf("adoptLessonCompletions", "adoptReviewGrades")))
        assertFalse(r.calls.any { it.startsWith("deleteOwnerless") })
        assertTrue(r.state!!.orphansResolved)
    }

    @Test
    fun `with nobody restored the ownerless rows are dropped, never kept for whoever signs in next`() = runBlocking {
        val r = Recorder()
        store(r).resolveOrphanedRows(null)
        assertFalse(r.calls.any { it.startsWith("adopt") })
        assertTrue(r.calls.containsAll(listOf("deleteOwnerlessLessonCompletions", "deleteOwnerlessReviewGrades")))
        assertTrue("the decision is final", r.state!!.orphansResolved)
    }

    @Test
    fun `after the first resolution ownerless rows are always dropped, even for a restored account`() = runBlocking {
        val r = Recorder().apply { state = AppSyncStateRecord(orphansResolved = true) }
        store(r).resolveOrphanedRows("u2")
        assertFalse(r.calls.any { it.startsWith("adopt") })
        assertTrue(r.calls.contains("deleteOwnerlessLessonCompletions"))
    }
}
