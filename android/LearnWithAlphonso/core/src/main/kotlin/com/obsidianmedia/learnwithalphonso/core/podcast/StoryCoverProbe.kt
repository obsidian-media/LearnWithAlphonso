package com.obsidianmedia.learnwithalphonso.core.podcast

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** What asking whether a cover exists can come back with. Only a definite [MISSING] is remembered, and only for a while. */
enum class CoverCheck { EXISTS, MISSING, UNKNOWN }

/**
 * Remembers which linear-story covers exist, so the library asks once and not on every load or render. A 200 is kept for the
 * life of the app; a "no such object" for [missingTtlMs] (so art uploaded later appears without an app update); a network
 * failure or a server error is never kept, and concurrent askers share one request. Port of StoryCoverProbe in Stories.swift;
 * mirrors src/lib/story-cover-probe.ts. Chosen over a `published`-style flag column: no migration, no regenerated types, no
 * step after the upload.
 */
class StoryCoverProbe(
    private val now: () -> Long = System::currentTimeMillis,
    private val missingTtlMs: Long = 10 * 60 * 1000L,
) {
    companion object {
        /** One per app. */
        val shared = StoryCoverProbe()
    }

    private val lock = Mutex()
    private val found = HashSet<String>()
    private val missingUntil = HashMap<String, Long>()
    private val inFlight = HashMap<String, CompletableDeferred<CoverCheck>>()

    /** Whether the object at [url] exists, calling [check] only when the answer is not already known. */
    suspend fun exists(url: String, check: suspend (String) -> CoverCheck): Boolean {
        var pending: CompletableDeferred<CoverCheck>? = null
        var mine: CompletableDeferred<CoverCheck>? = null
        lock.withLock {
            if (url in found) return true
            val until = missingUntil[url]
            if (until != null && now() < until) return false
            pending = inFlight[url]
            if (pending == null) {
                mine = CompletableDeferred<CoverCheck>().also { inFlight[url] = it }
            }
        }
        val result: CoverCheck = pending?.await() ?: run {
            val own = mine!!
            val asked = try {
                check(url)
            } catch (e: CancellationException) {
                lock.withLock { inFlight.remove(url) }
                own.cancel()
                throw e
            } catch (e: Exception) {
                CoverCheck.UNKNOWN
            }
            own.complete(asked)
            lock.withLock { inFlight.remove(url) }
            asked
        }
        lock.withLock {
            when (result) {
                CoverCheck.EXISTS -> { found.add(url); missingUntil.remove(url) }
                CoverCheck.MISSING -> missingUntil[url] = now() + missingTtlMs
                CoverCheck.UNKNOWN -> Unit
            }
        }
        return result == CoverCheck.EXISTS
    }
}
