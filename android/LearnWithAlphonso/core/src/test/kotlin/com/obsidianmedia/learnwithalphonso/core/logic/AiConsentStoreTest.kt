package com.obsidianmedia.learnwithalphonso.core.logic

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException

class AiConsentStoreTest {
    private class FakeBackend(var userId: String? = "u1") : AiConsentBackend {
        var server: String? = null
        var fetchFails = false
        var setFails = false
        var fetchGate: CompletableDeferred<Unit>? = null
        val setCalls = ArrayList<Boolean>()
        override fun currentUserId() = userId
        override suspend fun fetch(): String? {
            val answerAtRequestTime = server
            fetchGate?.await()
            if (fetchFails) throw IOException("offline")
            return answerAtRequestTime
        }
        override suspend fun set(granted: Boolean): String? {
            if (setFails) throw IOException("offline")
            setCalls.add(granted)
            server = if (granted) "2026-10-16T10:00:00+00:00" else null
            return server
        }
    }

    private class MemoryCache : AiConsentCache {
        val map = HashMap<String, String?>()
        override fun read(userId: String) = if (map.containsKey(userId)) CachedAiConsent(map[userId]) else null
        override fun write(userId: String, grantedAt: String?) { map[userId] = grantedAt }
    }

    @Test
    fun `nothing is known until the first read lands`() {
        val store = AiConsentStore(FakeBackend(), MemoryCache())
        assertEquals(AiConsentStatus.LOADING, store.statusOf())
        assertFalse(store.isGranted)
    }

    @Test
    fun `a server that says no consent is DENIED, one that says a timestamp is GRANTED`() = runTest {
        val backend = FakeBackend()
        val store = AiConsentStore(backend, MemoryCache())
        store.refresh()
        assertEquals(AiConsentStatus.DENIED, store.statusOf())
        backend.server = "2026-10-01T00:00:00+00:00"
        store.refresh()
        assertEquals(AiConsentStatus.GRANTED, store.statusOf())
        assertTrue(store.isGranted)
    }

    @Test
    fun `a failed read is UNAVAILABLE and never DENIED`() = runTest {
        val backend = FakeBackend().apply { fetchFails = true }
        val store = AiConsentStore(backend, MemoryCache())
        store.refresh()
        assertEquals(AiConsentStatus.UNAVAILABLE, store.statusOf())
    }

    @Test
    fun `a failed read keeps a cached grant, so offline someone who allowed AI stays allowed`() = runTest {
        val cache = MemoryCache().apply { write("u1", "2026-10-01T00:00:00+00:00") }
        val backend = FakeBackend().apply { fetchFails = true }
        val store = AiConsentStore(backend, cache)
        store.refresh()
        assertEquals(AiConsentStatus.GRANTED, store.statusOf())
    }

    @Test
    fun `allowing writes through the account and caches the answer`() = runTest {
        val backend = FakeBackend()
        val cache = MemoryCache()
        val store = AiConsentStore(backend, cache)
        store.refresh()
        store.set(true)
        assertEquals(listOf(true), backend.setCalls)
        assertEquals(AiConsentStatus.GRANTED, store.statusOf())
        assertEquals("2026-10-16T10:00:00+00:00", cache.map["u1"])
        store.set(false)
        assertEquals(AiConsentStatus.DENIED, store.statusOf())
        assertNull(cache.map["u1"])
    }

    @Test
    fun `a write that fails changes nothing`() = runTest {
        val backend = FakeBackend()
        val store = AiConsentStore(backend, MemoryCache())
        store.refresh()
        backend.setFails = true
        assertThrows(IOException::class.java) { kotlinx.coroutines.runBlocking { store.set(true) } }
        assertEquals(AiConsentStatus.DENIED, store.statusOf())
    }

    @Test
    fun `an allow the server answers without a timestamp is refused, not trusted`() = runTest {
        val backend = object : AiConsentBackend {
            override fun currentUserId() = "u1"
            override suspend fun fetch(): String? = null
            override suspend fun set(granted: Boolean): String? = null
        }
        val store = AiConsentStore(backend, MemoryCache())
        assertThrows(AiConsentUnexpectedResponseException::class.java) { kotlinx.coroutines.runBlocking { store.set(true) } }
        assertFalse(store.isGranted)
    }

    @Test
    fun `setting while signed out throws`() = runTest {
        val store = AiConsentStore(FakeBackend(userId = null), MemoryCache())
        assertThrows(AiConsentSignedOutException::class.java) { kotlinx.coroutines.runBlocking { store.set(true) } }
    }

    @Test
    fun `a stale read result is dropped once a local decision happened`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val backend = FakeBackend().apply { fetchGate = gate }
        val store = AiConsentStore(backend, MemoryCache())
        val slowRead = async(start = CoroutineStart.UNDISPATCHED) { store.refresh() }
        backend.fetchGate = null
        store.set(true)
        gate.complete(Unit)
        slowRead.await()
        // The read asked before the allow and so answers "no consent"; it is out of date and the allow wins.
        assertEquals(AiConsentStatus.GRANTED, store.statusOf())
    }

    @Test
    fun `a server refusal closes the gate at once, before the re-read lands`() = runTest {
        val backend = FakeBackend().apply { server = "2026-10-01T00:00:00+00:00" }
        val store = AiConsentStore(backend, MemoryCache())
        store.refresh()
        assertTrue(store.isGranted)
        // The re-read is held back: the gate must already be closed while it is in flight.
        val gate = CompletableDeferred<Unit>()
        backend.fetchGate = gate
        backend.server = null
        val refusal = async(start = CoroutineStart.UNDISPATCHED) { store.serverRefusedForLackOfConsent() }
        assertEquals(AiConsentStatus.DENIED, store.statusOf())
        assertFalse(store.isGranted)
        gate.complete(Unit)
        refusal.await()
        assertEquals(AiConsentStatus.DENIED, store.statusOf())
    }

    @Test
    fun `a read that began before a refusal cannot reopen the gate`() = runTest {
        val backend = FakeBackend().apply { server = "2026-10-01T00:00:00+00:00" }
        val store = AiConsentStore(backend, MemoryCache())
        val gate = CompletableDeferred<Unit>()
        backend.fetchGate = gate
        // This read asked while the server still said "granted" and will answer that, late.
        val staleRead = async(start = CoroutineStart.UNDISPATCHED) { store.refresh() }
        backend.fetchGate = null
        backend.server = null
        store.serverRefusedForLackOfConsent()
        assertEquals(AiConsentStatus.DENIED, store.statusOf())
        gate.complete(Unit)
        staleRead.await()
        assertEquals(AiConsentStatus.DENIED, store.statusOf())
    }

    @Test
    fun `a read that fails after a local decision does not mark the setting unreadable`() = runTest {
        val backend = FakeBackend()
        val store = AiConsentStore(backend, MemoryCache())
        val gate = CompletableDeferred<Unit>()
        backend.fetchGate = gate
        backend.fetchFails = true
        val failingRead = async(start = CoroutineStart.UNDISPATCHED) { store.refresh() }
        backend.fetchGate = null
        store.set(true)
        gate.complete(Unit)
        failingRead.await()
        // The failure is about an answer that no longer matters.
        assertFalse(store.state.value.lastRefreshFailed)
        assertEquals(AiConsentStatus.GRANTED, store.statusOf())
    }

    @Test
    fun `a write that fails does not discard a read still in flight`() = runTest {
        val backend = FakeBackend().apply { server = "2026-10-01T00:00:00+00:00" }
        val store = AiConsentStore(backend, MemoryCache())
        val gate = CompletableDeferred<Unit>()
        backend.fetchGate = gate
        val read = async(start = CoroutineStart.UNDISPATCHED) { store.refresh() }
        backend.setFails = true
        assertThrows(IOException::class.java) { kotlinx.coroutines.runBlocking { store.set(false) } }
        gate.complete(Unit)
        read.await()
        // The failed write decided nothing, so the read's answer (granted) still lands.
        assertEquals(AiConsentStatus.GRANTED, store.statusOf())
    }

    @Test
    fun `a server refusal followed by an unreadable account shows UNAVAILABLE not a granted gate`() = runTest {
        val backend = FakeBackend().apply { server = "2026-10-01T00:00:00+00:00" }
        val store = AiConsentStore(backend, MemoryCache())
        store.refresh()
        backend.fetchFails = true
        store.serverRefusedForLackOfConsent()
        assertEquals(AiConsentStatus.UNAVAILABLE, store.statusOf())
        assertFalse(store.isGranted)
    }

    @Test
    fun `consent never carries over to another account`() = runTest {
        val backend = FakeBackend().apply { server = "2026-10-01T00:00:00+00:00" }
        val cache = MemoryCache()
        val store = AiConsentStore(backend, cache)
        store.refresh()
        assertTrue(store.isGranted)
        // A different account signs in: until its own read lands it is LOADING, never the previous account's grant.
        backend.userId = "u2"
        assertFalse(store.isGranted)
        assertEquals(AiConsentStatus.LOADING, store.statusOf())
        backend.server = null
        store.refresh()
        assertEquals(AiConsentStatus.DENIED, store.statusOf())
        assertEquals("2026-10-01T00:00:00+00:00", cache.map["u1"])
    }

    @Test
    fun `an allow finishing after the account changed is kept for the account it was made for`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val cache = MemoryCache()
        val backend = object : AiConsentBackend {
            var user: String? = "u1"
            override fun currentUserId() = user
            override suspend fun fetch(): String? = null
            override suspend fun set(granted: Boolean): String? { gate.await(); return "2026-10-16T10:00:00+00:00" }
        }
        val store = AiConsentStore(backend, cache)
        store.refresh()
        val allow = async(start = CoroutineStart.UNDISPATCHED) { store.set(true) }
        backend.user = "u2"
        gate.complete(Unit)
        allow.await()
        assertEquals("2026-10-16T10:00:00+00:00", cache.map["u1"])
        assertFalse(store.isGranted)
    }

    @Test
    fun `signed out is resolved and not granted`() = runTest {
        val store = AiConsentStore(FakeBackend(userId = null), MemoryCache())
        store.refresh()
        assertFalse(store.isGranted)
    }
}
