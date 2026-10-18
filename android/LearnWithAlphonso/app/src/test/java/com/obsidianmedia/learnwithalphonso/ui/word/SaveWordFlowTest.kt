package com.obsidianmedia.learnwithalphonso.ui.word

import com.obsidianmedia.learnwithalphonso.MainDispatcherRule
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentBackend
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentCache
import com.obsidianmedia.learnwithalphonso.core.logic.AiConsentStore
import com.obsidianmedia.learnwithalphonso.core.logic.CachedAiConsent
import com.obsidianmedia.learnwithalphonso.core.logic.SaveWordRequest
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordError
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordException
import com.obsidianmedia.learnwithalphonso.core.logic.SavedWordResult
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.io.IOException

class SaveWordFlowTest {
    @get:Rule val main = MainDispatcherRule()

    private class Backend(var granted: Boolean, var fails: Boolean = false) : AiConsentBackend {
        var fetches = 0
        override fun currentUserId() = "u1"
        override suspend fun fetch(): String? { fetches++; if (fails) throw IOException("down"); return if (granted) "2026-10-01T00:00:00Z" else null }
        override suspend fun set(granted: Boolean): String? { this.granted = granted; return if (granted) "2026-10-17T00:00:00Z" else null }
    }

    private class Cache : AiConsentCache {
        private val map = HashMap<String, CachedAiConsent>()
        override fun read(userId: String) = map[userId]
        override fun write(userId: String, grantedAt: String?) { map[userId] = CachedAiConsent(grantedAt) }
    }

    private val request = SaveWordRequest("tea", "I like tea.", "en")
    private val saved = SavedWordResult(false, "tea", "I like tea.", "\"tea\" means a drink.")

    private class Calls { val seen = ArrayList<Triple<String, String, String>>() }

    private fun vm(
        backend: Backend = Backend(granted = true),
        request: SaveWordRequest = this.request,
        hasSession: Boolean = true,
        calls: Calls = Calls(),
        define: suspend () -> SavedWordResult = { saved },
    ): Triple<SaveWordFlow, Backend, Calls> {
        val store = AiConsentStore(backend, Cache())
        val v = SaveWordFlow(request, { w, s, c -> calls.seen.add(Triple(w, s, c)); define() }, store, { hasSession }, CoroutineScope(SupervisorJob() + Dispatchers.Main))
        return Triple(v, backend, calls)
    }

    @Test
    fun `saving sends the validated word, sentence and course and shows the stored meaning`() = runBlocking {
        val (v, _, calls) = vm(request = SaveWordRequest(" café ", "Un café chaud.", "fr"))
        assertEquals(SaveWordPhase.Idle, v.phase.value)
        v.save().join()
        assertEquals(SaveWordPhase.Saved(saved), v.phase.value)
        assertEquals(listOf(Triple("café", "Un café chaud.", "fr")), calls.seen)
    }

    @Test
    fun `an already saved word is shown as saved`() = runBlocking {
        val again = saved.copy(alreadySaved = true)
        val (v, _, _) = vm(define = { again })
        v.save().join()
        assertEquals(SaveWordPhase.Saved(again), v.phase.value)
    }

    @Test
    fun `an account that has not allowed AI is asked, nothing is sent, and allowing saves`() = runBlocking {
        val backend = Backend(granted = false)
        val store = AiConsentStore(backend, Cache())
        val calls = Calls()
        val v = SaveWordFlow(request, { w, s, c -> calls.seen.add(Triple(w, s, c)); saved }, store, { true }, CoroutineScope(SupervisorJob() + Dispatchers.Main))
        v.save().join()
        assertEquals(SaveWordPhase.NeedsConsent, v.phase.value)
        assertTrue("nothing left the device", calls.seen.isEmpty())
        v.declineConsent()
        assertEquals(SaveWordPhase.Idle, v.phase.value)
        v.save().join()
        assertEquals(SaveWordPhase.NeedsConsent, v.phase.value)
        store.set(true)
        v.save().join()
        assertEquals(SaveWordPhase.Saved(saved), v.phase.value)
        assertEquals(1, calls.seen.size)
    }

    @Test
    fun `a setting that cannot be read is never treated as off`() = runBlocking {
        val (v, _, calls) = vm(backend = Backend(granted = true, fails = true))
        v.save().join()
        assertEquals(SaveWordPhase.Failed(SavedWordError.UNAVAILABLE), v.phase.value)
        assertTrue(calls.seen.isEmpty())
    }

    @Test
    fun `signed out, or a request the server would refuse, never reaches the network`() = runBlocking {
        val (signedOut, _, calls1) = vm(hasSession = false)
        signedOut.save().join()
        assertEquals(SaveWordPhase.Failed(SavedWordError.NOT_SIGNED_IN), signedOut.phase.value)
        assertTrue(calls1.seen.isEmpty())

        val (invalid, _, calls2) = vm(request = SaveWordRequest("coffee", "I like tea.", "en"))
        invalid.save().join()
        assertEquals(SaveWordPhase.Failed(SavedWordError.INVALID), invalid.phase.value)
        assertTrue(calls2.seen.isEmpty())
    }

    @Test
    fun `each failure becomes its own message, and a transport failure is offline`() = runBlocking {
        val cases: List<Pair<Throwable, SavedWordError>> = listOf(
            SavedWordException(SavedWordError.QUOTA_EXCEEDED) to SavedWordError.QUOTA_EXCEEDED,
            SavedWordException(SavedWordError.LIMIT_REACHED) to SavedWordError.LIMIT_REACHED,
            SavedWordException(SavedWordError.UNAVAILABLE) to SavedWordError.UNAVAILABLE,
            IOException("no route") to SavedWordError.OFFLINE,
            java.nio.channels.UnresolvedAddressException() to SavedWordError.OFFLINE,
            IllegalStateException("boom") to SavedWordError.UNAVAILABLE,
        )
        for ((thrown, expected) in cases) {
            val (v, _, _) = vm(define = { throw thrown })
            v.save().join()
            assertEquals(thrown.toString(), SaveWordPhase.Failed(expected), v.phase.value)
        }
    }

    @Test
    fun `a failure can be retried`() = runBlocking {
        var attempts = 0
        val (v, _, _) = vm(define = { if (attempts++ == 0) throw IOException("blip") else saved })
        v.save().join()
        assertEquals(SaveWordPhase.Failed(SavedWordError.OFFLINE), v.phase.value)
        v.save().join()
        assertEquals(SaveWordPhase.Saved(saved), v.phase.value)
    }

    @Test
    fun `consent withdrawn on another device is read again and the choice is shown`() = runBlocking {
        val (v, backend, _) = vm(define = { throw SavedWordException(SavedWordError.AI_CONSENT_REQUIRED) })
        v.save().join()
        assertEquals(SaveWordPhase.NeedsConsent, v.phase.value)
        assertTrue("the setting was read again", backend.fetches >= 2)
    }

    @Test
    fun `a second tap while a save is in flight sends nothing`() = runBlocking {
        val gate = CompletableDeferred<Unit>()
        val (v, _, calls) = vm(define = { gate.await(); saved })
        val first = v.save()
        val second = v.save()
        assertEquals(SaveWordPhase.Saving, v.phase.value)
        gate.complete(Unit)
        first.join()
        second.join()
        assertEquals("the quota is charged once", 1, calls.seen.size)
        assertEquals(SaveWordPhase.Saved(saved), v.phase.value)
    }
}
