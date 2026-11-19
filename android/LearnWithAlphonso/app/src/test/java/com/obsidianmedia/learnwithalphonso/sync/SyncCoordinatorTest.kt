package com.obsidianmedia.learnwithalphonso.sync

import com.obsidianmedia.learnwithalphonso.FakeServer
import com.obsidianmedia.learnwithalphonso.FakeServer.Companion.json
import com.obsidianmedia.learnwithalphonso.MemorySyncStore
import com.obsidianmedia.learnwithalphonso.PROGRESS_JSON
import com.obsidianmedia.learnwithalphonso.awaitTrue
import com.obsidianmedia.learnwithalphonso.core.auth.AccountChangedException
import com.obsidianmedia.learnwithalphonso.core.net.ProgressSyncClient
import com.obsidianmedia.learnwithalphonso.core.net.SupabaseHttp
import com.obsidianmedia.learnwithalphonso.core.sync.AccountQueueRetention
import com.obsidianmedia.learnwithalphonso.core.sync.ForeignOwnerClock
import com.obsidianmedia.learnwithalphonso.core.sync.PendingLessonCompletion
import com.obsidianmedia.learnwithalphonso.core.sync.PendingReviewGrade
import com.obsidianmedia.learnwithalphonso.core.sync.SignOutGuard
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

    private fun clock(): ForeignOwnerClock {
        var raw: String? = null
        return ForeignOwnerClock({ raw }, { raw = it })
    }

    private fun theirs(owner: String = "u2") = PendingLessonCompletion("theirs", 5, emptyList(), "en", now - 500, 50, ownerUserId = owner)

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
    fun `another account's rows are kept, unsent, for that account`() = runBlocking {
        val s = server(failFirst = 0)
        val store = MemorySyncStore().apply {
            completions.add(row())
            completions.add(theirs())
        }
        SyncCoordinator(store, { s.progressClient }, { "u1" }, { true }, null, { now }, ownerClock = clock()).triggerSync()
        assertEquals(listOf("theirs"), store.completions.map { it.lessonId })
        assertEquals("only the signed-in account's row was sent", 1, completes(s))
        assertTrue(s.seen.none { it.body.contains("theirs") })
    }

    @Test
    fun `another account's rows expire 30 days after it left, timed from its departure`() = runBlocking {
        val s = server(failFirst = 0)
        val day = 24L * 60 * 60 * 1000
        val c = clock().apply {
            markRetired("u2", now - 31 * day)
            markRetired("u3", now - 29 * day)
        }
        val store = MemorySyncStore().apply {
            completions.add(theirs("u2"))
            // Queued long before u3 left: it still gets its 30 days from the departure.
            completions.add(PendingLessonCompletion("recent", 5, emptyList(), "en", now - 300 * day, 50, ownerUserId = "u3"))
            grades.add(PendingReviewGrade("k", "a", "en", now - 400, ownerUserId = "u2"))
        }
        SyncCoordinator(store, { s.progressClient }, { "u1" }, { true }, null, { now }, ownerClock = c).triggerSync()
        assertEquals(listOf("recent"), store.completions.map { it.lessonId })
        assertTrue("u2's answer expired with its lesson", store.grades.isEmpty())
        assertEquals("expired rows are deleted, never sent", 0, completes(s))
        assertTrue(AccountQueueRetention.FOREIGN_ROW_LIFETIME_MILLIS == 30 * day)
    }

    @Test
    fun `a sign-out keeps the account's queued lesson, and it syncs when the same account signs back in`() = runBlocking {
        val s = server(failFirst = 0)
        val c = clock()
        val store = MemorySyncStore().apply { completions.add(row(owner = "u1")) }
        var user: String? = null
        val coordinator = SyncCoordinator(store, { s.progressClient }, { user }, { true }, null, { now }, ownerClock = c)
        coordinator.endSession("u1")
        assertEquals("kept for u1", 1, store.completions.size)
        assertEquals("its 30 days start at the sign-out", now, c.retiredAt("u1"))
        user = "u2"
        coordinator.triggerSync()
        assertEquals("another account never sends it", 0, completes(s))
        assertEquals(1, store.completions.size)
        user = "u1"
        coordinator.triggerSync()
        assertTrue("u1 is back: the lesson synced", store.completions.isEmpty())
        assertEquals(1, completes(s))
        assertNull("and u1 is no longer an account that left", c.retiredAt("u1"))
    }

    @Test
    fun `an account that signs out with nothing queued leaves no departure behind`() = runBlocking {
        val c = clock().apply { markRetired("u1", 1L) }
        val coordinator = SyncCoordinator(MemorySyncStore(), { null }, { null }, { true }, null, { now }, ownerClock = c)
        coordinator.endSession("u1")
        assertNull(c.retiredAt("u1"))
    }

    @Test
    fun `sign-out first tries to send, and asks only when something is still waiting`() = runBlocking {
        val up = server(failFirst = 0)
        val synced = MemorySyncStore().apply { completions.add(row()); completions.add(theirs()) }
        assertEquals(
            "everything of u1's went: sign out at once (u2's row is not u1's to warn about)",
            SignOutGuard.Decision.SignOut,
            SyncCoordinator(synced, { up.progressClient }, { "u1" }, { true }, null, { now }).prepareSignOut("u1"),
        )
        assertEquals(1, completes(up))

        // The server is down for everything: both stay queued.
        val down = FakeServer { json("""{"error":"overloaded"}""", HttpStatusCode.ServiceUnavailable) }
        val stuck = MemorySyncStore().apply {
            completions.add(row())
            grades.add(PendingReviewGrade("k", "a", "en", now - 400, ownerUserId = "u1"))
        }
        val decision = SyncCoordinator(stuck, { down.progressClient }, { "u1" }, { true }, null, { now }).prepareSignOut("u1")
        assertEquals(SignOutGuard.Decision.Confirm("1 lesson and 1 review answer haven't synced yet. Sign out anyway?", SignOutGuard.MESSAGE), decision)
        assertEquals("asking never deletes anything", 1, stuck.completions.size)
    }

    @Test
    fun `no pass runs before the session is restored and the ownerless rows are resolved`() = runBlocking {
        val startup = CompletableDeferred<Unit>()
        val s = server(failFirst = 0)
        val store = MemorySyncStore().apply { completions.add(row()) }
        val coordinator = SyncCoordinator(store, { s.progressClient }, { "u1" }, { true }, null, { now }, startup = startup)
        val pass = async(Dispatchers.Default) { coordinator.triggerSync() }
        delay(200)
        assertEquals("waiting for startup", 0, completes(s))
        startup.complete(Unit)
        pass.await()
        assertEquals(1, completes(s))
    }

    @Test
    fun `a pass stops the moment the account changes, so account A's rows never go out under B's token`() = runBlocking {
        var user = "u1"
        val completes = AtomicInteger(0)
        val s = FakeServer { req ->
            when {
                req.path.endsWith("start-lesson-session") -> json("""{"token":"tok"}""")
                req.path.endsWith("complete-lesson") -> {
                    completes.incrementAndGet()
                    user = "u2" // the learner signs out and into another account while the first row is on the wire
                    json(done)
                }
                else -> json("[]")
            }
        }
        val store = MemorySyncStore().apply {
            completions.add(row())
            completions.add(PendingLessonCompletion("second", 5, emptyList(), "en", now - 500, 50, ownerUserId = "u1"))
        }
        SyncCoordinator(store, { s.progressClient }, { user }, { true }, null, { now }).triggerSync()
        assertEquals("the second row was not sent after the account changed", 1, completes.get())
        assertTrue("and it was not discarded either", store.completions.any { it.lessonId == "second" })
    }

    @Test
    fun `a pass that ends after the account changed removes what it sent but writes nothing to the caches`() = runBlocking {
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
        assertTrue("the row was sent for u1, so it leaves the queue rather than being sent again", store.completions.isEmpty())
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
    fun `a progress read that ends after the account changed is not stored under the new account`() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val s = FakeServer { req ->
            if (req.path.contains("progress")) gate.await()
            json("[]")
        }
        val store = MemorySyncStore()
        var user = "u1"
        val coordinator = SyncCoordinator(store, { s.progressClient }, { user }, { true }, null, { now })
        val pass = async(Dispatchers.Default) { coordinator.triggerSync() }
        awaitTrue("the progress read is in flight") { s.seen.any { it.path.contains("progress") } }
        user = "u2"
        gate.complete(Unit)
        pass.await()
        assertNull("nothing from the old account's read is stored", store.syncedAt)
        assertNull(store.lastKnownProgress())
    }

    @Test
    fun `signing out clears that account from the app scope, a switch clears the one left, and the launch does not`() = runBlocking {
        val ids = MutableStateFlow<String?>(null)
        val cleared = java.util.Collections.synchronizedList(ArrayList<String>())
        SignOutCleanup(scope(), ids) { cleared.add(it) }
        delay(100)
        assertEquals("cold launch: nobody signed in yet", emptyList<String>(), cleared.toList())
        ids.value = "u1"
        delay(100)
        assertEquals(emptyList<String>(), cleared.toList())
        ids.value = "u2" // straight to another account: u1 ended
        awaitTrue("u1 cleared on the switch") { cleared.toList() == listOf("u1") }
        delay(100)
        ids.value = null
        awaitTrue("u2 cleared on sign-out") { cleared.toList() == listOf("u1", "u2") }
    }

    @Test
    fun `one failing clear does not end the cleanup`() = runBlocking {
        val ids = MutableStateFlow<String?>("u1")
        val attempts = java.util.Collections.synchronizedList(ArrayList<String>())
        SignOutCleanup(scope(), ids) { attempts.add(it); if (it == "u1") throw IllegalStateException("disk full") }
        delay(100)
        ids.value = null
        awaitTrue("first clear attempted") { attempts.toList() == listOf("u1") }
        delay(100)
        ids.value = "u2"
        delay(100)
        ids.value = null
        awaitTrue("the next sign-out is still seen") { attempts.toList() == listOf("u1", "u2") }
    }

    @Test
    fun `the watcher reports the account that ended, never a launch or a repeat`() {
        val watcher = SignOutWatcher()
        assertNull("cold launch: nobody signed in yet", watcher.endedAccount(null))
        assertNull("the session was restored", watcher.endedAccount("u1"))
        assertNull("no change", watcher.endedAccount("u1"))
        assertEquals("u1", watcher.endedAccount(null))
        assertNull("still signed out", watcher.endedAccount(null))
        assertNull(watcher.endedAccount("u2"))
        assertEquals("a straight switch ends the old account", "u2", watcher.endedAccount("u3"))
    }

    @Test
    fun `deleting an account removes its rows and the caches, not another account's queue`() = runBlocking {
        val s = server(failFirst = 0)
        val store = MemorySyncStore().apply {
            completions.add(row(owner = "u1"))
            completions.add(PendingLessonCompletion("theirs", 5, emptyList(), "en", now - 500, 50, ownerUserId = "u2"))
        }
        val coordinator = SyncCoordinator(store, { s.progressClient }, { "u2" }, { true }, null, { now })
        coordinator.clearAccount("u1")
        assertEquals(listOf("u1"), store.clearedAccounts)
        assertEquals(listOf("theirs"), store.completions.map { it.lessonId })
    }

    @Test
    fun `a row with no owner after startup is removed and never sent`() = runBlocking {
        val s = server(failFirst = 0)
        val store = MemorySyncStore().apply { completions.add(row(owner = null)) }
        SyncCoordinator(store, { s.progressClient }, { "u1" }, { true }, null, { now }).triggerSync()
        assertTrue(store.completions.isEmpty())
        assertEquals(0, completes(s))
    }

    @Test
    fun `each pass gets a client for the account that started it`() = runBlocking {
        val s = server(failFirst = 0)
        val store = MemorySyncStore().apply { completions.add(row()) }
        val asked = java.util.Collections.synchronizedList(ArrayList<String>())
        SyncCoordinator(store, { userId -> asked.add(userId); s.progressClient }, { "u1" }, { true }, null, { now }).triggerSync()
        assertEquals(listOf("u1"), asked.toList())
    }

    /** A client whose token reads and refreshes fail once [user] is not [passUser], as SessionManager.freshAccessTokenFor does. */
    private fun guarded(s: FakeServer, passUser: String, user: () -> String): ProgressSyncClient {
        fun token(): String = if (user() != passUser) throw AccountChangedException() else "tok-$passUser"
        return ProgressSyncClient(SupabaseHttp("https://x.supabase.co", "pk", { token() }, s.engine, refresh = { token() }))
    }

    @Test
    fun `a 403 that triggers a re-mint after the account changed sends nothing under the new account`() = runBlocking {
        var user = "u1"
        val s = FakeServer { req ->
            when {
                req.path.endsWith("complete-lesson") -> { user = "u2"; json("""{"error":"Invalid or expired lesson session"}""", HttpStatusCode.Forbidden) }
                else -> json("""{"token":"fresh"}""")
            }
        }
        val store = MemorySyncStore().apply { completions.add(row().copy(sessionToken = "held")) }
        SyncCoordinator(store, { passUser -> guarded(s, passUser, { user }) }, { user }, { true }, null, { now }).triggerSync()
        assertEquals("only the request made while u1 was signed in went out", listOf("complete-lesson"), s.seen.map { it.path.substringAfterLast('/') })
        assertEquals("and the row is untouched", 1, store.completions.size)
    }

    @Test
    fun `a 401 refresh after the account changed does not resend the body under the new account`() = runBlocking {
        var user = "u1"
        val s = FakeServer { req ->
            if (req.path.endsWith("complete-lesson")) { user = "u2"; json("""{"error":"jwt expired"}""", HttpStatusCode.Unauthorized) }
            else json("""{"token":"tok"}""")
        }
        val store = MemorySyncStore().apply { completions.add(row().copy(sessionToken = "held")) }
        SyncCoordinator(store, { passUser -> guarded(s, passUser, { user }) }, { user }, { true }, null, { now }).triggerSync()
        assertEquals(1, s.seen.size)
        assertEquals(1, store.completions.size)
    }

    @Test
    fun `a pass closes its client however it ends`() = runBlocking {
        val closed = java.util.concurrent.atomic.AtomicInteger(0)
        val ok = server(failFirst = 0)
        val store = MemorySyncStore().apply { completions.add(row()) }
        SyncCoordinator(store, { ok.progressClient }, { "u1" }, { true }, null, { now }, closeClient = { closed.incrementAndGet() }).triggerSync()
        assertEquals("a normal pass", 1, closed.get())

        // The account changes while the pass runs: it returns early, and still releases its client.
        var user = "u1"
        val switching = FakeServer { req -> if (req.path.endsWith("complete-lesson")) { user = "u2" }; json(done) }
        val store2 = MemorySyncStore().apply { completions.add(row()) }
        SyncCoordinator(store2, { switching.progressClient }, { user }, { true }, null, { now }, closeClient = { closed.incrementAndGet() }).triggerSync()
        assertEquals("a pass cut short by an account change", 2, closed.get())

        // Nothing to sync and no session: no client is made, so nothing is closed.
        SyncCoordinator(MemorySyncStore(), { null }, { "u1" }, { true }, null, { now }, closeClient = { closed.incrementAndGet() }).triggerSync()
        assertEquals(2, closed.get())
    }
}
