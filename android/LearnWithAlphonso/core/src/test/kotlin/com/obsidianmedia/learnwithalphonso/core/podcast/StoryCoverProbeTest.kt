package com.obsidianmedia.learnwithalphonso.core.podcast

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The cover probe's cache rules: one request for concurrent askers, and a vanished asker never breaks the others. */
class StoryCoverProbeTest {
    @Test
    fun `two concurrent callers share one request`() = runTest {
        val gate = CompletableDeferred<CoverCheck>()
        var asked = 0
        val probe = StoryCoverProbe()
        val a = async { probe.exists("u") { asked++; gate.await() } }
        runCurrent()
        val b = async { probe.exists("u") { asked++; gate.await() } }
        runCurrent()
        gate.complete(CoverCheck.EXISTS)
        assertTrue(a.await())
        assertTrue(b.await())
        assertEquals(1, asked)
    }

    @Test
    fun `when the asking request is cancelled, a waiting caller gets unknown instead of a cancellation`() = runTest {
        val gate = CompletableDeferred<CoverCheck>()
        val probe = StoryCoverProbe()
        val owner = launch { probe.exists("u") { gate.await() } }
        runCurrent()
        val waiter = async { probe.exists("u") { error("a waiter must not ask") } }
        runCurrent()
        owner.cancel()
        runCurrent()
        assertFalse(waiter.await())
        // Unknown is never remembered: the next caller asks again.
        assertTrue(probe.exists("u") { CoverCheck.EXISTS })
    }

    @Test
    fun `an accented slug is a percent-encoded public URL`() {
        assertEquals(
            "https://x.supabase.co/storage/v1/object/public/story-art/fr/l-%C3%A9p%C3%A9e/cover.jpg",
            Stories.linearCoverUrl("https://x.supabase.co", "fr", "l-\u00e9p\u00e9e"),
        )
        assertEquals(
            "https://x.supabase.co/storage/v1/object/public/story-art/en/a%20b/cover.jpg",
            Stories.linearCoverUrl("https://x.supabase.co/", "en", "a b"),
        )
    }
}
